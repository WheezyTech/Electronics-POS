import uuid
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    GasBrand, GasCylinderSize, GasCylinder, GasStock, GasStockMovement,
    GasRefill, GasExchange, GasPurchase, CylinderDeposit, NewCylinderSale,
)
from .serializers import (
    GasBrandSerializer, GasCylinderSizeSerializer, GasCylinderSerializer,
    GasStockSerializer, GasMovementSerializer, CylinderDepositSerializer,
    GasRefillSerializer, GasExchangeSerializer, GasPurchaseSerializer,
    NewCylinderSaleSerializer,
)
from .permissions import GasAuthorizedPermission, GasTransactionPermission


def reference(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:12].upper()}"


@transaction.atomic
def change_gas_stock(*, location, brand, size, cylinder_status, quantity_delta,
                     movement_type, performed_by, reference_value="", notes=""):
    stock, _ = GasStock.objects.select_for_update().get_or_create(
        location=location, brand=brand, size=size,
        defaults={"full_quantity": 0, "empty_quantity": 0},
    )
    if cylinder_status == "FULL":
        before = stock.full_quantity
        after = before + quantity_delta
        if after < 0:
            raise ValidationError("Full cylinder stock cannot be negative.")
        stock.full_quantity = after
    else:
        before = stock.empty_quantity
        after = before + quantity_delta
        if after < 0:
            raise ValidationError("Empty cylinder stock cannot be negative.")
        stock.empty_quantity = after
    stock.save(update_fields=["full_quantity", "empty_quantity", "updated_at"])
    GasStockMovement.objects.create(
        transaction_id=uuid.uuid4(),
        location=location,
        brand=brand,
        size=size,
        cylinder_status=cylinder_status,
        movement_type=movement_type,
        quantity_delta=quantity_delta,
        quantity_before=before,
        quantity_after=after,
        reference=reference_value,
        notes=notes,
        performed_by=performed_by,
    )
    return stock


class BrandViewSet(viewsets.ModelViewSet):
    queryset = GasBrand.objects.all()
    serializer_class = GasBrandSerializer
    permission_classes = [IsAuthenticated, GasAuthorizedPermission]


class SizeViewSet(viewsets.ModelViewSet):
    queryset = GasCylinderSize.objects.all()
    serializer_class = GasCylinderSizeSerializer
    permission_classes = [IsAuthenticated, GasAuthorizedPermission]


class CylinderViewSet(viewsets.ModelViewSet):
    queryset = GasCylinder.objects.select_related("brand", "size", "location")
    serializer_class = GasCylinderSerializer
    permission_classes = [IsAuthenticated, GasAuthorizedPermission]

    def get_queryset(self):
        qs = super().get_queryset()
        for field in ("brand", "size", "location", "status"):
            value = self.request.query_params.get(field)
            if value:
                qs = qs.filter(**{f"{field}_id": value} if field != "status" else {"status": value})
        return qs


class StockViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GasStock.objects.select_related("location", "brand", "size")
    serializer_class = GasStockSerializer
    permission_classes = [IsAuthenticated, GasAuthorizedPermission]

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def record(self, request):
        data = request.data
        try:
            from apps.inventory.models import StockLocation

            location = StockLocation.objects.get(pk=data["location"])
            brand = GasBrand.objects.get(pk=data["brand"])
            size = GasCylinderSize.objects.get(pk=data["size"])
            full_delta = int(data.get("full_quantity", 0))
            empty_delta = int(data.get("empty_quantity", 0))
        except (KeyError, ValueError, TypeError):
            raise ValidationError(
                "Location, brand and size are required, with valid stock quantities."
            )
        if full_delta == 0 and empty_delta == 0:
            raise ValidationError("Enter a non-zero full or empty stock adjustment.")
        note = str(data.get("notes", "")).strip()
        if not note:
            raise ValidationError({"notes": "A reason is required for the stock audit trail."})

        tx_reference = str(data.get("reference", "")).strip() or reference("GSA")
        if full_delta:
            change_gas_stock(
                location=location,
                brand=brand,
                size=size,
                cylinder_status="FULL",
                quantity_delta=full_delta,
                movement_type=GasStockMovement.MovementType.ADJUSTMENT,
                performed_by=request.user,
                reference_value=tx_reference,
                notes=note,
            )
        if empty_delta:
            change_gas_stock(
                location=location,
                brand=brand,
                size=size,
                cylinder_status="EMPTY",
                quantity_delta=empty_delta,
                movement_type=GasStockMovement.MovementType.ADJUSTMENT,
                performed_by=request.user,
                reference_value=tx_reference,
                notes=note,
            )
        stock = GasStock.objects.get(location=location, brand=brand, size=size)
        return Response(
            {
                "reference": tx_reference,
                "stock": GasStockSerializer(stock).data,
            },
            status=status.HTTP_201_CREATED,
        )


class MovementViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GasStockMovement.objects.select_related("location", "brand", "size", "performed_by")
    serializer_class = GasMovementSerializer
    permission_classes = [IsAuthenticated, GasAuthorizedPermission]


class DepositViewSet(viewsets.ModelViewSet):
    queryset = CylinderDeposit.objects.select_related("brand", "size", "cylinder")
    serializer_class = CylinderDepositSerializer
    permission_classes = [IsAuthenticated, GasAuthorizedPermission]

    def perform_create(self, serializer):
        serializer.save(reference=reference("DEP"), received_by=self.request.user)

    @action(detail=True, methods=["post"])
    def refund(self, request, pk=None):
        deposit = self.get_object()
        if deposit.status != CylinderDeposit.Status.OUTSTANDING:
            raise ValidationError("This deposit is already closed.")
        deposit.status = CylinderDeposit.Status.REFUNDED
        deposit.refunded_at = timezone.now()
        deposit.save(update_fields=["status", "refunded_at"])
        return Response(CylinderDepositSerializer(deposit).data)


class RefillViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GasRefill.objects.select_related("location", "brand", "size")
    serializer_class = GasRefillSerializer
    permission_classes = [IsAuthenticated, GasTransactionPermission]

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def create_refill(self, request):
        data = request.data
        try:
            location_id = data["location"]
            brand_id = data["brand"]
            size_id = data["size"]
            quantity = int(data.get("quantity", 1))
            refill_price = Decimal(str(data["refill_price"]))
        except (KeyError, ValueError, ArithmeticError):
            raise ValidationError("Location, brand, size, quantity and refill price are required.")
        if quantity < 1 or refill_price < 0:
            raise ValidationError("Quantity and refill price must be valid.")
        from apps.inventory.models import StockLocation
        location = StockLocation.objects.get(pk=location_id)
        brand = GasBrand.objects.get(pk=brand_id)
        size = GasCylinderSize.objects.get(pk=size_id)
        total = refill_price * quantity
        tx_reference = reference("REF")
        refill = GasRefill.objects.create(
            reference=tx_reference,
            location=location,
            brand=brand,
            size=size,
            customer_name=data.get("customer_name", ""),
            customer_phone=data.get("customer_phone", ""),
            quantity=quantity,
            standard_option=data.get("standard_option", ""),
            refill_price=refill_price,
            total_amount=total,
            payment_method=data["payment_method"],
            transaction_reference=data.get("transaction_reference", ""),
            recorded_by=request.user,
        )
        change_gas_stock(location=location, brand=brand, size=size, cylinder_status="FULL",
                         quantity_delta=-quantity, movement_type=GasStockMovement.MovementType.REFILL_ISSUE,
                         performed_by=request.user, reference_value=tx_reference)
        change_gas_stock(location=location, brand=brand, size=size, cylinder_status="EMPTY",
                         quantity_delta=quantity, movement_type=GasStockMovement.MovementType.REFILL_RETURN,
                         performed_by=request.user, reference_value=tx_reference)
        return Response(GasRefillSerializer(refill).data, status=status.HTTP_201_CREATED)


class ExchangeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GasExchange.objects.select_related("location", "brand", "size")
    serializer_class = GasExchangeSerializer
    permission_classes = [IsAuthenticated, GasTransactionPermission]

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def create_exchange(self, request):
        data = request.data
        try:
            quantity = int(data.get("quantity", 1))
            refill_payment = Decimal(str(data.get("refill_payment", "0")))
            from apps.inventory.models import StockLocation
            location = StockLocation.objects.get(pk=data["location"])
            brand = GasBrand.objects.get(pk=data["brand"])
            size = GasCylinderSize.objects.get(pk=data["size"])
        except (KeyError, ValueError, ArithmeticError):
            raise ValidationError("Location, brand, size and quantity are required.")
        if quantity < 1:
            raise ValidationError("Quantity must be greater than zero.")
        tx_reference = reference("EXC")
        exchange = GasExchange.objects.create(
            reference=tx_reference,
            location=location,
            brand=brand,
            size=size,
            customer_name=data["customer_name"],
            customer_phone=data.get("customer_phone", ""),
            quantity=quantity,
            refill_payment=refill_payment,
            payment_method=data["payment_method"],
            transaction_reference=data.get("transaction_reference", ""),
            recorded_by=request.user,
        )
        change_gas_stock(location=location, brand=brand, size=size, cylinder_status="EMPTY",
                         quantity_delta=quantity, movement_type=GasStockMovement.MovementType.EXCHANGE_RECEIVED,
                         performed_by=request.user, reference_value=tx_reference)
        change_gas_stock(location=location, brand=brand, size=size, cylinder_status="FULL",
                         quantity_delta=-quantity, movement_type=GasStockMovement.MovementType.EXCHANGE_ISSUE,
                         performed_by=request.user, reference_value=tx_reference)
        return Response(GasExchangeSerializer(exchange).data, status=status.HTTP_201_CREATED)


class PurchaseViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GasPurchase.objects.select_related("supplier", "location", "brand", "size")
    serializer_class = GasPurchaseSerializer
    permission_classes = [IsAuthenticated, GasAuthorizedPermission]

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def create_purchase(self, request):
        data = request.data
        try:
            from apps.inventory.models import StockLocation
            from apps.purchases.models import Supplier
            location = StockLocation.objects.get(pk=data["location"])
            supplier = Supplier.objects.get(pk=data["supplier"])
            brand = GasBrand.objects.get(pk=data["brand"])
            size = GasCylinderSize.objects.get(pk=data["size"])
            full_quantity = int(data.get("full_cylinders_received", 0))
            empty_quantity = int(data.get("empty_cylinders_returned", 0))
            purchase_price = Decimal(str(data["purchase_price"]))
        except (KeyError, ValueError, ArithmeticError):
            raise ValidationError("Supplier, location, brand, size and purchase price are required.")
        if full_quantity < 0 or empty_quantity < 0 or purchase_price < 0:
            raise ValidationError("Purchase quantities and price must be valid.")
        if full_quantity == 0 and empty_quantity == 0:
            raise ValidationError("Receive at least one full or empty cylinder.")
        tx_reference = reference("GP")
        purchase = GasPurchase.objects.create(
            reference=tx_reference,
            supplier=supplier,
            location=location,
            brand=brand,
            size=size,
            full_cylinders_received=full_quantity,
            empty_cylinders_returned=empty_quantity,
            purchase_price=purchase_price,
            delivery_date=data["delivery_date"],
            invoice_reference=data.get("invoice_reference", ""),
            compliance_reference=data.get("compliance_reference", ""),
            recorded_by=request.user,
        )
        if full_quantity:
            change_gas_stock(location=location, brand=brand, size=size, cylinder_status="FULL",
                             quantity_delta=full_quantity, movement_type=GasStockMovement.MovementType.PURCHASE_FULL,
                             performed_by=request.user, reference_value=tx_reference)
        if empty_quantity:
            change_gas_stock(location=location, brand=brand, size=size, cylinder_status="EMPTY",
                             quantity_delta=-empty_quantity, movement_type=GasStockMovement.MovementType.PURCHASE_EMPTY,
                             performed_by=request.user, reference_value=tx_reference)
        return Response(GasPurchaseSerializer(purchase).data, status=status.HTTP_201_CREATED)


class NewCylinderSaleViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = NewCylinderSale.objects.select_related("location", "brand", "size")
    serializer_class = NewCylinderSaleSerializer
    permission_classes = [IsAuthenticated, GasTransactionPermission]

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def create_sale(self, request):
        data = request.data
        try:
            quantity = int(data.get("quantity", 1))
            selling_price = Decimal(str(data["selling_price"]))
            deposit_amount = Decimal(str(data.get("deposit_amount", "0")))
            from apps.inventory.models import StockLocation
            location = StockLocation.objects.get(pk=data["location"])
            brand = GasBrand.objects.get(pk=data["brand"])
            size = GasCylinderSize.objects.get(pk=data["size"])
            status_value = data["status"]
        except (KeyError, ValueError, ArithmeticError):
            raise ValidationError("Location, brand, size, status and selling price are required.")
        if quantity < 1 or selling_price < 0 or deposit_amount < 0:
            raise ValidationError("Quantity, selling price and deposit must be valid.")
        if status_value not in ("FULL", "EMPTY"):
            raise ValidationError("Cylinder status must be FULL or EMPTY.")
        tx_reference = reference("GCS")
        sale = NewCylinderSale.objects.create(
            reference=tx_reference,
            location=location,
            brand=brand,
            size=size,
            status=status_value,
            quantity=quantity,
            selling_price=selling_price,
            deposit_amount=deposit_amount,
            includes_gas=data.get("includes_gas", True),
            customer_name=data.get("customer_name", ""),
            customer_phone=data.get("customer_phone", ""),
            accessories=data.get("accessories", []),
            payment_method=data["payment_method"],
            transaction_reference=data.get("transaction_reference", ""),
            recorded_by=request.user,
        )
        movement_type = (GasStockMovement.MovementType.NEW_CYLINDER_SALE
                         if status_value == "FULL" else GasStockMovement.MovementType.EMPTY_CYLINDER_SALE)
        change_gas_stock(location=location, brand=brand, size=size, cylinder_status=status_value,
                         quantity_delta=-quantity, movement_type=movement_type,
                         performed_by=request.user, reference_value=tx_reference)
        if deposit_amount > 0:
            CylinderDeposit.objects.create(
                reference=reference("DEP"),
                customer_name=data.get("customer_name", ""),
                customer_phone=data.get("customer_phone", ""),
                brand=brand,
                size=size,
                amount=deposit_amount,
                received_by=request.user,
            )
        return Response(NewCylinderSaleSerializer(sale).data, status=status.HTTP_201_CREATED)


class GasReportAPIView(APIView):
    permission_classes = [IsAuthenticated, GasAuthorizedPermission]

    def get(self, request):
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")

        def apply_date(queryset, field="created_at"):
            if date_from:
                queryset = queryset.filter(**{f"{field}__date__gte": date_from})
            if date_to:
                queryset = queryset.filter(**{f"{field}__date__lte": date_to})
            return queryset

        refills = apply_date(GasRefill.objects.all())
        exchanges = apply_date(GasExchange.objects.all())
        purchases = apply_date(GasPurchase.objects.all())
        sales = apply_date(NewCylinderSale.objects.all())
        stocks = GasStock.objects.select_related("location", "brand", "size")
        deposit_total = CylinderDeposit.objects.filter(status=CylinderDeposit.Status.OUTSTANDING).aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0.00")

        refill_sales = refills.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        exchange_sales = exchanges.aggregate(total=Sum("refill_payment"))["total"] or Decimal("0.00")
        cylinder_sales = sales.aggregate(total=Sum("selling_price"))["total"] or Decimal("0.00")
        purchase_cost = purchases.aggregate(total=Sum("purchase_price"))["total"] or Decimal("0.00")

        return Response({
            "daily": {
                "refills": refills.count(),
                "refill_sales": refill_sales,
                "exchanges": exchanges.count(),
                "exchange_sales": exchange_sales,
                "new_cylinder_sales": sales.count(),
                "new_cylinder_sales_amount": cylinder_sales,
                "purchases": purchases.count(),
                "purchase_cost": purchase_cost,
                "gas_profit": refill_sales + exchange_sales + cylinder_sales - purchase_cost,
                "cylinders_issued": (
                    GasStockMovement.objects.filter(
                        movement_type__in=[
                            "REFILL_ISSUE",
                            "EXCHANGE_ISSUE",
                            "NEW_CYLINDER_SALE",
                        ]
                    ).aggregate(total=Sum("quantity_delta"))["total"] or 0
                ) * -1,
                "cylinders_received_or_returned": (
                    GasStockMovement.objects.filter(
                        movement_type__in=[
                            "EXCHANGE_RECEIVED",
                            "REFILL_RETURN",
                        ]
                    ).aggregate(total=Sum("quantity_delta"))["total"] or 0
                ),
            },
            "stock": {
                "full_cylinders": sum(stock.full_quantity for stock in stocks),
                "empty_cylinders": sum(stock.empty_quantity for stock in stocks),
            },
            "outstanding_cylinder_deposits": deposit_total,
            "movements": GasMovementSerializer(
                GasStockMovement.objects.select_related("location", "brand", "size").order_by("-created_at")[:200],
                many=True,
            ).data,
        })
