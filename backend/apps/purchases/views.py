
from decimal import Decimal

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from .permissions import SupplierPermission
from .models import Supplier
from .serializers import SupplierSerializer
from .permissions import SupplierPermission

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.permissions import ReadOnlyStaffRoles
from .models import PurchaseOrder, PurchaseOrderItem
from .serializers import (
    PurchaseOrderSerializer,
    PurchaseOrderCreateSerializer,
    PurchaseOrderItemSerializer,
    PurchaseOrderItemCreateSerializer,
    PurchaseOrderStatusSerializer,
)
from .permissions import PurchaseOrderPermission

from .models import GoodsReceivedNote, GoodsReceivedItem
from .serializers import (
    GoodsReceivedNoteSerializer,
    GoodsReceivedNoteCreateSerializer,
    GoodsReceivedItemSerializer,
    GoodsReceivedItemCreateSerializer,
)

from apps.inventory.models import StockMovement
from apps.inventory.serializers import StockMovementSerializer
from apps.inventory.services import change_stock

from .models import (
    SupplierReturn,
    SupplierReturnItem,
    GoodsReceivedItem,
)
from .serializers import (
    SupplierReturnSerializer,
    SupplierReturnCreateSerializer,
    SupplierReturnItemSerializer,
    SupplierReturnItemCreateSerializer,
)

from .models import SupplierPayment
from .serializers import (
    SupplierPaymentSerializer,
    SupplierPaymentCreateSerializer,
)
from .permissions import SupplierPermission

from .models import SupplierInvoice
from .serializers import (
    SupplierInvoiceSerializer,
    SupplierInvoiceCreateSerializer,
)

class SupplierViewSet(viewsets.ModelViewSet):

    serializer_class = SupplierSerializer

    permission_classes = [
        IsAuthenticated,
        SupplierPermission,
    ]

    filter_backends = [
        SearchFilter,
        OrderingFilter,
    ]

    search_fields = [
        "name",
        "contact_person",
        "phone_number",
        "email",
        "kra_pin",
        "city",
    ]

    ordering_fields = [
        "name",
        "created_at",
        "opening_balance",
    ]

    ordering = ["name"]

    def get_queryset(self):

        queryset = Supplier.objects.all()

        is_active = self.request.query_params.get("is_active")

        if is_active is not None:
            if is_active.lower() in ["true", "1"]:
                queryset = queryset.filter(is_active=True)

            elif is_active.lower() in ["false", "0"]:
                queryset = queryset.filter(is_active=False)

        return queryset

    def perform_create(self, serializer):

        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["get"], url_path="statement")
    def statement(self, request, pk=None):
        supplier = self.get_object()

        invoices = SupplierInvoice.objects.filter(
            supplier=supplier,
            status=SupplierInvoice.Status.POSTED
        ).order_by("invoice_date")

        payments = SupplierPayment.objects.filter(
            supplier=supplier,
            status=SupplierPayment.Status.POSTED
        ).order_by("payment_date")

        return Response({
            "supplier": supplier.name,
            "invoices": SupplierInvoiceSerializer(
                invoices, many=True
            ).data,
            "payments": SupplierPaymentSerializer(
                payments, many=True
            ).data,
            "total_invoiced": sum(
                (invoice.total_amount for invoice in invoices),
                Decimal("0.00")
            ),
            "total_paid": sum(
                (payment.amount for payment in payments),
                Decimal("0.00")
            ),
        })


class PurchaseOrderViewSet(viewsets.ModelViewSet):

    queryset = PurchaseOrder.objects.select_related(
        "supplier",
        "destination",
        "created_by",
        "approved_by",
    ).prefetch_related(
        "items__product"
    )

    permission_classes = [
        IsAuthenticated,
        PurchaseOrderPermission,
    ]

    filter_backends = [
        SearchFilter,
        OrderingFilter,
    ]

    search_fields = [
        "reference",
        "supplier__name",
    ]

    ordering_fields = [
        "created_at",
        "order_date",
        "grand_total",
    ]

    ordering = ["-created_at"]

    def get_serializer_class(self):

        if self.action == "create":
            return PurchaseOrderCreateSerializer

        return PurchaseOrderSerializer

    def create(self, request, *args, **kwargs):

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order = serializer.save()

        return Response(
            PurchaseOrderSerializer(order).data,
            status=status.HTTP_201_CREATED
        )

    def get_queryset(self):

        queryset = super().get_queryset()

        order_status = self.request.query_params.get("status")
        supplier_id = self.request.query_params.get("supplier")

        if order_status:
            queryset = queryset.filter(status=order_status.upper())

        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)

        return queryset

    def _get_locked_order(self, pk):

        try:
            return PurchaseOrder.objects.select_for_update().get(pk=pk)
        except PurchaseOrder.DoesNotExist:
            raise ValidationError("Purchase order not found.")

    @action(detail=True, methods=["post"], url_path="items")
    def add_item(self, request, pk=None):

        with transaction.atomic():

            order = self._get_locked_order(pk)

            if order.status != PurchaseOrder.Status.DRAFT:
                raise ValidationError(
                    "Products can only be added to draft orders."
                )

            serializer = PurchaseOrderItemCreateSerializer(
                data=request.data
            )
            serializer.is_valid(raise_exception=True)

            data = serializer.validated_data

            item = PurchaseOrderItem.objects.create(
                purchase_order=order,
                **data
            )

            order.recalculate_totals()

        return Response(
            PurchaseOrderItemSerializer(item).data,
            status=status.HTTP_201_CREATED
        )

    @action(
        detail=True,
        methods=["patch"],
        url_path=r"items/(?P<item_id>[^/.]+)"
    )
    def update_item(self, request, pk=None, item_id=None):

        with transaction.atomic():

            order = self._get_locked_order(pk)

            if order.status != PurchaseOrder.Status.DRAFT:
                raise ValidationError(
                    "Only draft orders can be edited."
                )

            try:
                item = PurchaseOrderItem.objects.get(
                    pk=item_id,
                    purchase_order=order
                )
            except PurchaseOrderItem.DoesNotExist:
                raise ValidationError("Purchase order item not found.")

            serializer = PurchaseOrderItemSerializer(
                item,
                data=request.data,
                partial=True
            )

            serializer.is_valid(raise_exception=True)
            serializer.save()

            order.recalculate_totals()

        return Response(serializer.data)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"items/(?P<item_id>[^/.]+)"
    )
    def remove_item(self, request, pk=None, item_id=None):

        with transaction.atomic():

            order = self._get_locked_order(pk)

            if order.status != PurchaseOrder.Status.DRAFT:
                raise ValidationError(
                    "Only draft orders can be edited."
                )

            deleted, _ = PurchaseOrderItem.objects.filter(
                pk=item_id,
                purchase_order=order
            ).delete()

            if not deleted:
                raise ValidationError("Purchase order item not found.")

            order.recalculate_totals()

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):

        with transaction.atomic():

            order = self._get_locked_order(pk)

            if order.status != PurchaseOrder.Status.DRAFT:
                raise ValidationError("Only draft orders can be submitted.")

            if not order.items.exists():
                raise ValidationError(
                    "Add at least one product before submitting."
                )

            order.status = PurchaseOrder.Status.SUBMITTED
            order.save(update_fields=["status", "updated_at"])

        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):

        if not (
            request.user.is_superuser
            or request.user.role == "ADMINISTRATOR"
        ):
            raise ValidationError(
                "Only an administrator can approve purchase orders."
            )

        with transaction.atomic():

            order = self._get_locked_order(pk)

            if order.status != PurchaseOrder.Status.SUBMITTED:
                raise ValidationError(
                    "Only submitted purchase orders can be approved."
                )

            order.status = PurchaseOrder.Status.APPROVED
            order.approved_by = request.user
            order.approved_at = timezone.now()

            order.save(update_fields=[
                "status",
                "approved_by",
                "approved_at",
                "updated_at",
            ])

        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):

        with transaction.atomic():

            order = self._get_locked_order(pk)

            if order.status not in [
                PurchaseOrder.Status.DRAFT,
                PurchaseOrder.Status.SUBMITTED,
                PurchaseOrder.Status.APPROVED,
            ]:
                raise ValidationError(
                    "This purchase order cannot be cancelled."
                )

            order.status = PurchaseOrder.Status.CANCELLED
            order.save(update_fields=["status", "updated_at"])

        return Response(PurchaseOrderSerializer(order).data)


class GoodsReceivedNoteViewSet(viewsets.ModelViewSet):

    queryset = GoodsReceivedNote.objects.select_related(
        "purchase_order",
        "purchase_order__supplier",
        "purchase_order__destination",
        "received_by",
        "posted_by",
    ).prefetch_related(
        "items__purchase_order_item__product"
    )

    permission_classes = [
        IsAuthenticated,
        PurchaseOrderPermission,
    ]

    http_method_names = [
        "get", "post", "head", "options"
    ]

    filter_backends = [
        SearchFilter,
        OrderingFilter,
    ]

    search_fields = [
        "reference",
        "purchase_order__reference",
        "supplier_delivery_note",
        "supplier_invoice_number",
    ]

    ordering_fields = [
        "created_at",
        "received_at",
        "posted_at",
    ]

    ordering = ["-created_at"]

    def get_serializer_class(self):

        if self.action == "create":
            return GoodsReceivedNoteCreateSerializer

        return GoodsReceivedNoteSerializer

    def get_queryset(self):

        queryset = super().get_queryset()

        grn_status = self.request.query_params.get("status")
        order_id = self.request.query_params.get("purchase_order")

        if grn_status:
            queryset = queryset.filter(status=grn_status.upper())

        if order_id:
            queryset = queryset.filter(
                purchase_order_id=order_id
            )

        return queryset

    def create(self, request, *args, **kwargs):

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        grn = serializer.save()

        return Response(
            GoodsReceivedNoteSerializer(grn).data,
            status=status.HTTP_201_CREATED
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="items"
    )
    def add_item(self, request, pk=None):

        with transaction.atomic():

            try:
                grn = GoodsReceivedNote.objects.select_for_update().get(
                    pk=pk
                )
            except GoodsReceivedNote.DoesNotExist:
                raise ValidationError("GRN not found.")

            if grn.status != GoodsReceivedNote.Status.DRAFT:
                raise ValidationError(
                    "Products can only be added to draft GRNs."
                )

            serializer = GoodsReceivedItemCreateSerializer(
                data=request.data,
                context={"grn": grn}
            )

            serializer.is_valid(raise_exception=True)

            item = GoodsReceivedItem.objects.create(
                goods_received_note=grn,
                **serializer.validated_data
            )

        return Response(
            GoodsReceivedItemSerializer(item).data,
            status=status.HTTP_201_CREATED
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="post"
    )
    def post_grn(self, request, pk=None):

        if not (
            request.user.is_superuser
            or request.user.role in [
                "ADMINISTRATOR",
                "STORE_MANAGER"
            ]
        ):
            raise ValidationError(
                "You are not authorized to post GRNs."
            )

        with transaction.atomic():

            try:
                grn = GoodsReceivedNote.objects.select_for_update().select_related(
                    "purchase_order",
                    "purchase_order__destination"
                ).get(pk=pk)

            except GoodsReceivedNote.DoesNotExist:
                raise ValidationError("GRN not found.")

            if grn.status != GoodsReceivedNote.Status.DRAFT:
                raise ValidationError(
                    "Only draft GRNs can be posted."
                )

            order = PurchaseOrder.objects.select_for_update().get(
                pk=grn.purchase_order_id
            )

            if order.status not in [
                PurchaseOrder.Status.APPROVED,
                PurchaseOrder.Status.PARTIALLY_RECEIVED,
            ]:
                raise ValidationError(
                    "Purchase order is not approved for receiving."
                )

            items = list(
                GoodsReceivedItem.objects.select_for_update()
                .filter(goods_received_note=grn)
                .select_related(
                    "purchase_order_item",
                    "purchase_order_item__product"
                )
            )

            if not items:
                raise ValidationError(
                    "Add at least one product before posting the GRN."
                )

            # Lock all purchase order items involved.
            order_item_ids = sorted({
                item.purchase_order_item_id
                for item in items
            })

            locked_order_items = {
                item.id: item
                for item in PurchaseOrderItem.objects.select_for_update()
                .filter(
                    id__in=order_item_ids,
                    purchase_order=order
                ).order_by("id")
            }

            # Validate the complete GRN before changing any stock.
            quantities_by_order_item = {}

            for item in items:

                order_item = locked_order_items.get(
                    item.purchase_order_item_id
                )

                if order_item is None:
                    raise ValidationError(
                        "A GRN item does not belong to this purchase order."
                    )

                quantities_by_order_item[order_item.id] = (
                    quantities_by_order_item.get(
                        order_item.id, 0
                    ) + item.quantity_received
                )

            for item_id, incoming_quantity in quantities_by_order_item.items():

                order_item = locked_order_items[item_id]

                if (
                    order_item.received_quantity + incoming_quantity
                    > order_item.quantity
                ):
                    raise ValidationError(
                        f"Received quantity exceeds ordered quantity "
                        f"for {order_item.product.name}."
                    )

            # Post each received product through the inventory service.
            movements = []

            for item in items:

                order_item = locked_order_items[
                    item.purchase_order_item_id
                ]

                movement = change_stock(
                    product=order_item.product,
                    location=order.destination,
                    quantity_delta=item.quantity_received,
                    movement_type=StockMovement.MovementType.RECEIPT,
                    user=request.user,
                    unit_cost=item.unit_cost,
                    reference=grn.reference,
                    notes=(
                        f"Received against purchase order "
                        f"{order.reference}. "
                        f"Supplier delivery note: "
                        f"{grn.supplier_delivery_note}"
                    ),
                )

                movements.append(movement)

                order_item.received_quantity += item.quantity_received

                order_item.save(
                    update_fields=["received_quantity"]
                )

            # Update purchase order status.
            order_items = list(
                PurchaseOrderItem.objects.filter(
                    purchase_order=order
                )
            )

            if all(
                item.received_quantity == item.quantity
                for item in order_items
            ):
                order.status = PurchaseOrder.Status.COMPLETED

            else:
                order.status = PurchaseOrder.Status.PARTIALLY_RECEIVED

            order.save(
                update_fields=["status", "updated_at"]
            )

            # Mark GRN as posted.
            grn.status = GoodsReceivedNote.Status.POSTED
            grn.posted_by = request.user
            grn.posted_at = timezone.now()

            grn.save(
                update_fields=[
                    "status",
                    "posted_by",
                    "posted_at",
                ]
            )

        return Response({
            "message": "Goods received successfully. Inventory updated.",
            "grn": GoodsReceivedNoteSerializer(grn).data,
            "purchase_order_status": order.status,
            "stock_movements": StockMovementSerializer(
                movements,
                many=True
            ).data,
        }, status=status.HTTP_200_OK)


class SupplierReturnViewSet(viewsets.ModelViewSet):
    queryset = SupplierReturn.objects.select_related(
        "supplier",
        "original_grn",
        "original_grn__purchase_order",
        "original_grn__purchase_order__destination",
        "created_by",
        "posted_by",
    ).prefetch_related(
        "items",
        "items__original_received_item",
        "items__original_received_item__purchase_order_item",
        "items__original_received_item__purchase_order_item__product",
    )

    serializer_class = SupplierReturnSerializer
    permission_classes = [IsAuthenticated, ReadOnlyStaffRoles]

    def get_serializer_class(self):
        if self.action == "create":
            return SupplierReturnCreateSerializer

        return SupplierReturnSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        status_filter = self.request.query_params.get("status")
        supplier_filter = self.request.query_params.get("supplier")
        grn_filter = self.request.query_params.get("original_grn")

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if supplier_filter:
            queryset = queryset.filter(supplier_id=supplier_filter)

        if grn_filter:
            queryset = queryset.filter(original_grn_id=grn_filter)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        supplier_return = serializer.save()

        output = SupplierReturnSerializer(
            supplier_return,
            context=self.get_serializer_context()
        )

        return Response(
            output.data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"], url_path="items")
    def add_item(self, request, pk=None):
        supplier_return = self.get_object()

        if supplier_return.status != SupplierReturn.Status.DRAFT:
            raise ValidationError(
                "Items can only be added to draft supplier returns."
            )

        serializer = SupplierReturnItemCreateSerializer(
            data=request.data,
            context={
                **self.get_serializer_context(),
                "supplier_return": supplier_return,
            }
        )

        serializer.is_valid(raise_exception=True)
        serializer.save()

        output = SupplierReturnItemSerializer(
            supplier_return.items.select_related(
                "original_received_item"
            ).all(),
            many=True
        )

        return Response(
            output.data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"], url_path="post")
    @transaction.atomic
    def post_return(self, request, pk=None):
        supplier_return = (
            SupplierReturn.objects
            .select_for_update()
            .select_related(
                "original_grn",
                "original_grn__purchase_order",
                "original_grn__purchase_order__destination",
            )
            .get(pk=pk)
        )

        if supplier_return.status != SupplierReturn.Status.DRAFT:
            raise ValidationError(
                "Only draft supplier returns can be posted."
            )

        if supplier_return.original_grn.status != "POSTED":
            raise ValidationError(
                "The original GRN must be posted."
            )

        return_items = list(
            supplier_return.items.select_related(
                "original_received_item",
                "original_received_item__purchase_order_item",
                "original_received_item__purchase_order_item__product",
            ).all()
        )

        if not return_items:
            raise ValidationError(
                "Add at least one item before posting this return."
            )

        # Lock the original received items before validating quantities.
        received_item_ids = sorted({
            item.original_received_item_id
            for item in return_items
        })

        locked_received_items = {
            item.pk: item
            for item in GoodsReceivedItem.objects.select_for_update()
            .filter(pk__in=received_item_ids)
            .order_by("pk")
        }

        location = (
            supplier_return.original_grn
            .purchase_order.destination
        )

        movements = []

        for item in return_items:
            received_item = locked_received_items.get(
                item.original_received_item_id
            )

            if received_item is None:
                raise ValidationError(
                    "An original received item could not be found."
                )

            # Recheck all other non-cancelled returns for this GRN item.
            other_returns_quantity = (
                SupplierReturnItem.objects.filter(
                    original_received_item=received_item,
                    supplier_return__status__in=[
                        SupplierReturn.Status.DRAFT,
                        SupplierReturn.Status.POSTED,
                    ],
                )
                .exclude(
                    supplier_return=supplier_return
                )
                .aggregate(
                    total=Sum("quantity_returned")
                )["total"] or 0
            )

            current_return_quantity = (
                supplier_return.items.filter(
                    original_received_item=received_item
                ).aggregate(
                    total=Sum("quantity_returned")
                )["total"] or 0
            )

            if (
                other_returns_quantity + current_return_quantity
                > received_item.quantity_received
            ):
                raise ValidationError(
                    f"Return quantity exceeds the original received "
                    f"quantity for {received_item.product.name}."
                )

            # Deduct stock through the inventory service.
            try:
                movement = change_stock(
                    product=received_item.product,
                    location=location,
                    quantity_delta=-item.quantity_returned,
                    movement_type=StockMovement.MovementType.SUPPLIER_RETURN,
                    user=request.user,
                    reference=supplier_return.reference,
                    notes=(
                        item.notes
                        or supplier_return.notes
                        or "Supplier return"
                    ),
                    unit_cost=item.unit_cost,
                )

            except ValueError as exc:
                raise ValidationError(str(exc))

            movements.append(movement)

        supplier_return.status = SupplierReturn.Status.POSTED
        supplier_return.posted_by = request.user
        supplier_return.posted_at = timezone.now()

        supplier_return.save(
            update_fields=[
                "status",
                "posted_by",
                "posted_at",
            ]
        )

        output = SupplierReturnSerializer(
            supplier_return,
            context=self.get_serializer_context()
        )

        return Response({
            "message": "Supplier return posted successfully.",
            "supplier_return": output.data,
            "stock_movements": [
                {
                    "id": str(movement.id),
                    "movement_type": movement.movement_type,
                    "quantity_delta": str(movement.quantity_delta),
                    "quantity_before": str(movement.quantity_before),
                    "quantity_after": str(movement.quantity_after),
                    "reference": movement.reference,
                }
                for movement in movements
            ],
        }, status=status.HTTP_200_OK)


class SupplierPaymentViewSet(viewsets.ModelViewSet):
    queryset = SupplierPayment.objects.select_related(
        "supplier",
        "goods_received_note",
        "created_by",
        "posted_by",
    )

    serializer_class = SupplierPaymentSerializer
    permission_classes = [SupplierPermission]

    def get_serializer_class(self):
        if self.action == "create":
            return SupplierPaymentCreateSerializer
        return SupplierPaymentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        supplier = self.request.query_params.get("supplier")
        payment_status = self.request.query_params.get("status")
        method = self.request.query_params.get("payment_method")

        if supplier:
            queryset = queryset.filter(supplier_id=supplier)

        if payment_status:
            queryset = queryset.filter(status=payment_status)

        if method:
            queryset = queryset.filter(payment_method=method)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = serializer.save()

        return Response(
            SupplierPaymentSerializer(payment).data,
            status=status.HTTP_201_CREATED
        )

    def perform_update(self, serializer):
        payment = self.get_object()

        if payment.status != SupplierPayment.Status.DRAFT:
            raise ValidationError(
                "Only draft payments can be edited."
            )

        serializer.save()

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def post(self, request, pk=None):
        payment = SupplierPayment.objects.select_for_update().get(pk=pk)

        if payment.status != SupplierPayment.Status.DRAFT:
            raise ValidationError("Only draft payments can be posted.")

        if payment.supplier_invoice_id:
            invoice = SupplierInvoice.objects.select_for_update().get(
                pk=payment.supplier_invoice_id
            )

            if invoice.status != SupplierInvoice.Status.POSTED:
                raise ValidationError("The invoice is not posted.")

            if invoice.supplier_id != payment.supplier_id:
                raise ValidationError("Invoice supplier mismatch.")

            if payment.amount > invoice.outstanding_balance:
                raise ValidationError(
                    "Payment exceeds the remaining invoice balance."
                )

        payment.status = SupplierPayment.Status.POSTED
        payment.posted_by = request.user
        payment.posted_at = timezone.now()
        payment.save(update_fields=[
            "status", "posted_by", "posted_at"
        ])

        return Response({
            "message": "Supplier payment posted successfully.",
            "payment": SupplierPaymentSerializer(payment).data,
        })

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        from django.db import transaction

        with transaction.atomic():
            payment = SupplierPayment.objects.select_for_update().get(
                pk=pk
            )

            if payment.status != SupplierPayment.Status.DRAFT:
                raise ValidationError(
                    "Only draft payments can be cancelled. "
                    "Posted payments require a reversal process."
                )

            payment.status = SupplierPayment.Status.CANCELLED
            payment.save(update_fields=["status"])

        return Response({
            "message": "Supplier payment cancelled.",
            "payment": SupplierPaymentSerializer(payment).data,
        })


class SupplierInvoiceViewSet(viewsets.ModelViewSet):
    queryset = SupplierInvoice.objects.select_related(
        "supplier", "goods_received_note", "created_by", "posted_by"
    )
    permission_classes = [SupplierPermission]
    serializer_class = SupplierInvoiceSerializer

    def get_serializer_class(self):
        if self.action == "create":
            return SupplierInvoiceCreateSerializer
        return SupplierInvoiceSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        supplier = self.request.query_params.get("supplier")
        invoice_status = self.request.query_params.get("status")

        if supplier:
            queryset = queryset.filter(supplier_id=supplier)

        if invoice_status:
            queryset = queryset.filter(status=invoice_status)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = serializer.save()

        return Response(
            SupplierInvoiceSerializer(invoice).data,
            status=status.HTTP_201_CREATED
        )

    def perform_update(self, serializer):
        if self.get_object().status != SupplierInvoice.Status.DRAFT:
            raise ValidationError("Only draft invoices can be edited.")
        serializer.save()

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def post(self, request, pk=None):
        invoice = SupplierInvoice.objects.select_for_update().get(pk=pk)

        if invoice.status != SupplierInvoice.Status.DRAFT:
            raise ValidationError("Only draft invoices can be posted.")

        invoice.status = SupplierInvoice.Status.POSTED
        invoice.posted_by = request.user
        invoice.posted_at = timezone.now()
        invoice.save(update_fields=[
            "status", "posted_by", "posted_at"
        ])

        return Response({
            "message": "Supplier invoice posted successfully.",
            "invoice": SupplierInvoiceSerializer(invoice).data,
        })
