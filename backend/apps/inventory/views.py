
from decimal import Decimal

from django.db.models import F, ExpressionWrapper, DecimalField
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import ReadOnlyStaffRoles

from .models import StockLocation, StockBalance, StockMovement
from .serializers import (
    StockLocationSerializer,
    StockBalanceSerializer,
    StockMovementSerializer,
    StockOperationSerializer,
    StockAdjustmentSerializer,
    StockTransferSerializer,
)
from .permissions import InventoryReadPermission
from .services import change_stock, transfer_stock

from django.db import transaction
from django.utils import timezone

from apps.products.models import Product

from .models import StocktakeSession, StocktakeLine
from .serializers import (
    StocktakeSessionSerializer,
    StocktakeCreateSerializer,
    StocktakeCountSerializer,
)

class StockLocationViewSet(viewsets.ModelViewSet):
    queryset = StockLocation.objects.all()
    serializer_class = StockLocationSerializer
    permission_classes = [InventoryReadPermission]


class StockBalanceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StockBalanceSerializer
    permission_classes = [IsAuthenticated, ReadOnlyStaffRoles]

    def get_queryset(self):
        queryset = StockBalance.objects.select_related(
            "product", "location"
        ).all()

        product_id = self.request.query_params.get("product")
        location_id = self.request.query_params.get("location")

        if product_id:
            queryset = queryset.filter(product_id=product_id)

        if location_id:
            queryset = queryset.filter(location_id=location_id)

        return queryset


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated, ReadOnlyStaffRoles]

    def get_queryset(self):
        queryset = StockMovement.objects.select_related(
            "balance__product",
            "balance__location",
            "performed_by",
        ).all()

        product_id = self.request.query_params.get("product")
        location_id = self.request.query_params.get("location")
        movement_type = self.request.query_params.get("movement_type")
        reference = self.request.query_params.get("reference")

        if product_id:
            queryset = queryset.filter(
                balance__product_id=product_id
            )

        if location_id:
            queryset = queryset.filter(
                balance__location_id=location_id
            )

        if movement_type:
            queryset = queryset.filter(
                movement_type=movement_type
            )

        if reference:
            queryset = queryset.filter(reference__icontains=reference)

        return queryset


class StockReceiveAPIView(APIView):
    permission_classes = [InventoryReadPermission]

    def post(self, request):
        serializer = StockOperationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        try:
            movement = change_stock(
                product=data["product"],
                location=data["location"],
                quantity_delta=data["quantity"],
                movement_type=StockMovement.MovementType.RECEIPT,
                user=request.user,
                unit_cost=data.get("unit_cost"),
                reference=data.get("reference", ""),
                notes=data.get("notes", ""),
            )
        except ValueError as error:
            raise ValidationError({"detail": str(error)})

        return Response(
            StockMovementSerializer(movement).data,
            status=status.HTTP_201_CREATED,
        )


class StockIssueAPIView(APIView):
    permission_classes = [InventoryReadPermission]

    def post(self, request):
        serializer = StockOperationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        try:
            movement = change_stock(
                product=data["product"],
                location=data["location"],
                quantity_delta=-data["quantity"],
                movement_type=StockMovement.MovementType.ISSUE,
                user=request.user,
                reference=data.get("reference", ""),
                notes=data.get("notes", ""),
            )
        except ValueError as error:
            raise ValidationError({"detail": str(error)})

        return Response(
            StockMovementSerializer(movement).data,
            status=status.HTTP_201_CREATED,
        )


class StockAdjustmentAPIView(APIView):
    permission_classes = [InventoryReadPermission]

    def post(self, request):
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        try:
            movement = change_stock(
                product=data["product"],
                location=data["location"],
                quantity_delta=data["quantity"],
                movement_type=StockMovement.MovementType.ADJUSTMENT,
                user=request.user,
                unit_cost=data.get("unit_cost"),
                reference=data.get("reference", ""),
                notes=data.get("notes", ""),
            )
        except ValueError as error:
            raise ValidationError({"detail": str(error)})

        return Response(
            StockMovementSerializer(movement).data,
            status=status.HTTP_201_CREATED,
        )


class StockTransferAPIView(APIView):
    permission_classes = [InventoryReadPermission]

    def post(self, request):
        serializer = StockTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        try:
            outgoing, incoming = transfer_stock(
                product=data["product"],
                source=data["source"],
                destination=data["destination"],
                quantity=data["quantity"],
                user=request.user,
                reference=data.get("reference", ""),
                notes=data.get("notes", ""),
            )
        except ValueError as error:
            raise ValidationError({"detail": str(error)})

        return Response(
            {
                "message": "Stock transferred successfully.",
                "transaction_id": str(outgoing.transaction_id),
                "outgoing": StockMovementSerializer(outgoing).data,
                "incoming": StockMovementSerializer(incoming).data,
            },
            status=status.HTTP_201_CREATED,
        )


class LowStockAPIView(ListAPIView):
    serializer_class = StockBalanceSerializer
    permission_classes = [IsAuthenticated, ReadOnlyStaffRoles]

    def get_queryset(self):
        available_expression = ExpressionWrapper(
            F("quantity_on_hand") - F("quantity_reserved"),
            output_field=DecimalField(
                max_digits=14,
                decimal_places=3,
            ),
        )

        return (
            StockBalance.objects
            .select_related("product", "location")
            .annotate(available_stock=available_expression)
            .filter(
                product__reorder_level__gt=Decimal("0"),
                available_stock__lte=F("product__reorder_level"),
            )
            .order_by("product__name")
        )


class StocktakeListCreateAPIView(APIView):
    permission_classes = [InventoryReadPermission]

    def get(self, request):
        sessions = StocktakeSession.objects.select_related(
            "location", "created_by"
        ).prefetch_related(
            "lines__product"
        ).all()

        serializer = StocktakeSessionSerializer(
            sessions,
            many=True
        )

        return Response(serializer.data)

    @transaction.atomic
    def post(self, request):
        serializer = StocktakeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        location = data["location"]

        session = StocktakeSession.objects.create(
            location=location,
            reference=data["reference"],
            notes=data.get("notes", ""),
            created_by=request.user,
        )

        # Capture every active product, including products
        # that currently have zero stock at this location.
        products = Product.objects.filter(is_active=True).order_by("id")

        existing_balances = {
            balance.product_id: balance.quantity_on_hand
            for balance in StockBalance.objects.filter(
                location=location
            )
        }

        lines = [
            StocktakeLine(
                session=session,
                product=product,
                system_quantity=existing_balances.get(
                    product.id, Decimal("0.000")
                ),
            )
            for product in products
        ]

        StocktakeLine.objects.bulk_create(lines)

        return Response(
            StocktakeSessionSerializer(session).data,
            status=status.HTTP_201_CREATED,
        )


class StocktakeDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, ReadOnlyStaffRoles]

    def get(self, request, pk):
        try:
            session = StocktakeSession.objects.select_related(
                "location", "created_by"
            ).prefetch_related(
                "lines__product"
            ).get(pk=pk)
        except StocktakeSession.DoesNotExist:
            raise ValidationError(
                {"detail": "Stocktake session not found."}
            )

        return Response(
            StocktakeSessionSerializer(session).data
        )


class StocktakeCountAPIView(APIView):
    permission_classes = [InventoryReadPermission]

    def patch(self, request, session_id, line_id):
        serializer = StocktakeCountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                session = StocktakeSession.objects.select_for_update().get(
                    pk=session_id
                )

                if session.status != StocktakeSession.Status.IN_PROGRESS:
                    raise ValidationError(
                        {"detail": "This stocktake is not open for counting."}
                    )

                line = StocktakeLine.objects.select_for_update().get(
                    pk=line_id,
                    session=session,
                )

                line.counted_quantity = serializer.validated_data[
                    "counted_quantity"
                ]
                line.notes = serializer.validated_data.get("notes", "")
                line.save(
                    update_fields=["counted_quantity", "notes"]
                )

        except StocktakeSession.DoesNotExist:
            raise ValidationError(
                {"detail": "Stocktake session not found."}
            )
        except StocktakeLine.DoesNotExist:
            raise ValidationError(
                {"detail": "Stocktake product line not found."}
            )

        return Response(StocktakeLineSerializer(line).data)


class StocktakeCompleteAPIView(APIView):
    permission_classes = [InventoryReadPermission]

    @transaction.atomic
    def post(self, request, pk):
        try:
            session = StocktakeSession.objects.select_for_update().get(
                pk=pk
            )
        except StocktakeSession.DoesNotExist:
            raise ValidationError(
                {"detail": "Stocktake session not found."}
            )

        if session.status != StocktakeSession.Status.IN_PROGRESS:
            raise ValidationError(
                {"detail": "This stocktake is not in progress."}
            )

        lines = list(
            StocktakeLine.objects.select_related(
                "product"
            ).filter(
                session=session
            ).order_by("product_id")
        )

        if not lines:
            raise ValidationError(
                {"detail": "This stocktake has no products."}
            )

        incomplete = [
            line.product.name
            for line in lines
            if line.counted_quantity is None
        ]

        if incomplete:
            raise ValidationError({
                "detail": "All products must be counted before completion.",
                "uncounted_products": incomplete,
            })

        # Create missing zero-stock balances before locking.
        for line in lines:
            StockBalance.objects.get_or_create(
                product=line.product,
                location=session.location,
            )

        # Lock balances in consistent product order.
        balances = {
            balance.product_id: balance
            for balance in StockBalance.objects.select_for_update().filter(
                location=session.location,
                product_id__in=[line.product_id for line in lines],
            ).order_by("product_id")
        }

        # Check every line before posting any adjustments.
        discrepancies = []

        for line in lines:
            balance = balances[line.product_id]

            if balance.quantity_on_hand != line.system_quantity:
                discrepancies.append({
                    "product": line.product.name,
                    "stocktake_snapshot": str(line.system_quantity),
                    "current_system_stock": str(balance.quantity_on_hand),
                })

        if discrepancies:
            raise ValidationError({
                "detail": (
                    "Stock changed after the stocktake began. "
                    "Do not complete this session. Recount using a new "
                    "stocktake session."
                ),
                "changed_products": discrepancies,
            })

        adjustments = []

        # Post all differences through the stock movement service.
        for line in lines:
            balance = balances[line.product_id]

            difference = (
                line.counted_quantity - balance.quantity_on_hand
            )

            if difference == 0:
                continue

            movement = change_stock(
                product=line.product,
                location=session.location,
                quantity_delta=difference,
                movement_type=StockMovement.MovementType.ADJUSTMENT,
                user=request.user,
                reference=session.reference,
                notes=(
                    f"Stocktake adjustment. "
                    f"Physical count: {line.counted_quantity}. "
                    f"Original system quantity: {line.system_quantity}."
                ),
            )

            line.adjustment_movement = movement
            line.save(update_fields=["adjustment_movement"])

            adjustments.append(
                StockMovementSerializer(movement).data
            )

        session.status = StocktakeSession.Status.COMPLETED
        session.completed_at = timezone.now()
        session.save(update_fields=["status", "completed_at"])

        return Response({
            "message": "Stocktake completed successfully.",
            "reference": session.reference,
            "status": session.status,
            "adjustments_posted": len(adjustments),
            "adjustments": adjustments,
        })
