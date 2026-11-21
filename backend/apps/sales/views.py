
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdministrator, ReadOnlyStaffRoles
from apps.inventory.models import StockMovement
from apps.inventory.models import StockBalance
from apps.inventory.services import change_stock

from .models import MpesaTransaction, Sale, SaleItem, SalePayment
from .serializers import (
    SaleSerializer,
    SaleCreateSerializer,
    SaleItemSerializer,
    SaleItemCreateSerializer,
    CheckoutSerializer,
    SalePaymentEditSerializer,
)

from django.db.models import Sum
from rest_framework import status

from .models import Sale, SaleItem, SaleReturn, SaleReturnItem, SaleRefundPayment
from .serializers import (
    SaleReturnSerializer,
    SaleReturnCreateSerializer,
    SaleReturnItemSerializer,
    CompleteSaleReturnSerializer,
)


from .models import (
    CashierShift,
    CashMovement,
    SalePayment,
)

from .serializers import (
    CashierShiftSerializer,
    CashierShiftOpenSerializer,
    CashMovementSerializer,
)

from .mpesa import (
    MpesaRequestError,
    initiate_stk_push,
    normalize_mpesa_phone,
)

class SaleViewSet(viewsets.ModelViewSet):
    queryset = Sale.objects.select_related(
        "cashier", "location"
    ).prefetch_related(
        "items__product", "payments"
    )

    permission_classes = [IsAuthenticated, ReadOnlyStaffRoles]
    serializer_class = SaleSerializer

    def get_serializer_class(self):
        if self.action == "create":
            return SaleCreateSerializer
        return SaleSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if not (
            user.is_superuser
            or getattr(user, "role", "") in [
                "ADMINISTRATOR",
                "STORE_MANAGER",
                "ACCOUNTANT",
                "AUDITOR",
            ]
        ):
            queryset = queryset.filter(cashier=user)

        sale_status = self.request.query_params.get("status")
        location = self.request.query_params.get("location")
        cashier = self.request.query_params.get("cashier")

        if sale_status:
            queryset = queryset.filter(status=sale_status)

        if location:
            queryset = queryset.filter(location_id=location)

        if cashier:
            queryset = queryset.filter(cashier_id=cashier)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sale = serializer.save()

        return Response(
            SaleSerializer(sale).data,
            status=status.HTTP_201_CREATED
        )

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        user = request.user
        if not (
            user.is_superuser
            or getattr(user, "role", "") == "ADMINISTRATOR"
        ):
            raise PermissionDenied("Only administrators can delete sales.")

        sale = self.get_object()
        sale = Sale.objects.select_for_update().get(pk=sale.pk)

        if sale.status not in [
            Sale.Status.DRAFT,
            Sale.Status.CANCELLED,
        ]:
            raise ValidationError(
                "Only draft or cancelled sales can be deleted."
            )

        if (
            sale.payments.exists()
            or sale.mpesa_transactions.exists()
            or sale.returns.exists()
        ):
            raise ValidationError(
                "This sale has linked payment, M-Pesa, or return records "
                "and cannot be deleted."
            )

        self.perform_destroy(sale)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["put"],
        url_path="payments",
        permission_classes=[IsAuthenticated, IsAdministrator],
    )
    @transaction.atomic
    def update_payments(self, request, pk=None):
        sale = Sale.objects.select_for_update().get(pk=pk)
        if sale.status != Sale.Status.COMPLETED:
            raise ValidationError(
                "Only completed sale payments can be edited."
            )

        serializer = SalePaymentEditSerializer(
            data=request.data,
            many=True,
        )
        serializer.is_valid(raise_exception=True)
        payment_data = serializer.validated_data

        payment_ids = [item["id"] for item in payment_data]
        existing_ids = set(
            sale.payments.values_list("id", flat=True)
        )
        if len(payment_ids) != len(set(payment_ids)) or set(payment_ids) != existing_ids:
            raise ValidationError(
                "Provide each existing payment exactly once."
            )

        payment_total = sum(
            (item["amount"] for item in payment_data),
            Decimal("0.00"),
        )
        if payment_total != sale.total_amount:
            raise ValidationError({
                "payments": (
                    f"Payment total must equal the sale total of "
                    f"{sale.total_amount}."
                )
            })

        payments_by_id = {
            payment.id: payment
            for payment in sale.payments.select_for_update().all()
        }
        for item in payment_data:
            payment = payments_by_id[item["id"]]
            payment.payment_method = item["payment_method"]
            payment.amount = item["amount"]
            payment.transaction_reference = item.get(
                "transaction_reference", ""
            )
            payment.save(update_fields=[
                "payment_method", "amount", "transaction_reference",
            ])

        return Response(SaleSerializer(sale).data)

    @action(detail=True, methods=["post"], url_path="items")
    def add_item(self, request, pk=None):
        sale = self.get_object()

        serializer = SaleItemCreateSerializer(
            data=request.data,
            context={"sale": sale}
        )
        serializer.is_valid(raise_exception=True)
        item = serializer.save()

        return Response(
            SaleItemSerializer(item).data,
            status=status.HTTP_201_CREATED
        )

    @action(
        detail=True,
        methods=["patch"],
        url_path=r"items/(?P<item_id>[^/.]+)"
    )
    def update_item(self, request, pk=None, item_id=None):
        sale = self.get_object()

        if sale.status != Sale.Status.DRAFT:
            raise ValidationError(
                "Only draft sales can be modified."
            )

        try:
            item = sale.items.get(pk=item_id)
        except SaleItem.DoesNotExist:
            raise ValidationError("Sale item not found.")

        quantity = request.data.get(
            "quantity", item.quantity
        )
        unit_price = request.data.get(
            "unit_price", item.unit_price
        )
        discount = request.data.get(
            "discount_amount", item.discount_amount
        )

        try:
            quantity = Decimal(str(quantity))
            unit_price = Decimal(str(unit_price))
            discount = Decimal(str(discount))
        except Exception:
            raise ValidationError("Invalid item amounts.")

        if not all(x.is_finite() for x in (
            quantity, unit_price, discount
        )):
            raise ValidationError("Invalid item amounts.")

        if quantity <= 0 or unit_price < item.product.minimum_selling_price:
            raise ValidationError("Invalid quantity or selling price.")

        stock_balance = StockBalance.objects.filter(
            product=item.product,
            location=sale.location,
        ).first()
        available_quantity = (
            stock_balance.quantity_available
            if stock_balance
            else Decimal("0.000")
        )
        if quantity > available_quantity:
            raise ValidationError({
                "quantity": (
                    f"Insufficient stock at {sale.location.name}. "
                    f"Available quantity: {available_quantity}."
                )
            })

        if discount < 0 or discount > quantity * unit_price:
            raise ValidationError("Invalid discount.")

        item.quantity = quantity
        item.unit_price = unit_price
        item.discount_amount = discount
        item.save()

        sale.recalculate_totals()

        return Response(SaleItemSerializer(item).data)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"items/(?P<item_id>[^/.]+)"
    )
    def remove_item(self, request, pk=None, item_id=None):
        sale = self.get_object()

        if sale.status != Sale.Status.DRAFT:
            raise ValidationError(
                "Only draft sales can be modified."
            )

        try:
            item = sale.items.get(pk=item_id)
        except SaleItem.DoesNotExist:
            raise ValidationError("Sale item not found.")

        item.delete()
        sale.recalculate_totals()

        return Response(
            {"message": "Sale item removed."},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def checkout(self, request, pk=None):
        sale = Sale.objects.select_for_update().get(pk=pk)

        if sale.status != Sale.Status.DRAFT:
            raise ValidationError(
                "Only draft sales can be checked out."
            )

        items = list(
            sale.items.select_related("product").all()
        )

        if not items:
            raise ValidationError(
                "Add products before checkout."
            )

        sale.recalculate_totals()

        if sale.total_amount <= 0:
            raise ValidationError(
                "Sale total must be greater than zero."
            )

        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payments = serializer.validated_data["payments"]

        if sale.offline_authorization and any(
            payment["payment_method"] != SalePayment.PaymentMethod.CASH
            for payment in payments
        ):
            raise ValidationError(
                "Offline-authorized sales can only be paid in cash."
            )

        if sale.mpesa_transactions.filter(
            status__in=[
                MpesaTransaction.Status.PENDING,
                MpesaTransaction.Status.SUCCESS,
                MpesaTransaction.Status.REVIEW,
            ]
        ).exists():
            raise ValidationError(
                "This sale has an M-Pesa transaction pending or requiring reconciliation."
            )

        payment_total = sum(
            (payment["amount"] for payment in payments),
            Decimal("0.00")
        )

        if payment_total != sale.total_amount:
            raise ValidationError({
                "payments": (
                    f"Payment total must equal sale total "
                    f"of {sale.total_amount}."
                )
            })

        # Deduct stock and record inventory movements.
        movements = []

        for item in items:
            try:
                movement = change_stock(
                    product=item.product,
                    location=sale.location,
                    quantity_delta=-item.quantity,
                    movement_type=StockMovement.MovementType.ISSUE,
                    user=request.user,
                    reference=sale.reference,
                    notes="POS sale",
                    unit_cost=item.cost_price,
                )
            except ValueError as exc:
                raise ValidationError(str(exc))

            movements.append(movement)

        # Record all payments.
        for payment in payments:
            SalePayment.objects.create(
                sale=sale,
                payment_method=payment["payment_method"],
                amount=payment["amount"],
                transaction_reference=payment.get(
                    "transaction_reference", ""
                ),
                received_by=request.user,
            )

        sale.status = Sale.Status.COMPLETED
        sale.completed_at = timezone.now()
        sale.save(update_fields=[
            "status", "completed_at"
        ])

        return Response({
            "message": "Sale completed successfully.",
            "receipt": SaleSerializer(sale).data,
            "stock_movements": [
                {
                    "movement_type": movement.movement_type,
                    "quantity": str(movement.quantity_delta),
                    "reference": movement.reference,
                }
                for movement in movements
            ],
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        sale = self.get_object()

        if sale.status != Sale.Status.DRAFT:
            raise ValidationError(
                "Only draft sales can be cancelled."
            )

        sale.status = Sale.Status.CANCELLED
        sale.save(update_fields=["status"])

        return Response({
            "message": "Draft sale cancelled."
        })

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        sale = self.get_object()

        if sale.status != Sale.Status.COMPLETED:
            raise ValidationError(
                "Receipt is available only for completed sales."
            )

        return Response(SaleSerializer(sale).data)

class SaleReturnViewSet(viewsets.ModelViewSet):
    queryset = SaleReturn.objects.select_related(
        "sale", "processed_by"
    ).prefetch_related("items", "refund_payments__processed_by")
    permission_classes = [IsAuthenticated, ReadOnlyStaffRoles]

    def get_serializer_class(self):
        if self.action == "create":
            return SaleReturnCreateSerializer
        return SaleReturnSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        sale_id = self.request.query_params.get("sale")
        status_filter = self.request.query_params.get("status")

        if sale_id:
            queryset = queryset.filter(sale_id=sale_id)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return queryset

    @action(detail=True, methods=["post"], url_path="items")
    def add_item(self, request, pk=None):
        sale_return = self.get_object()

        if sale_return.status != SaleReturn.Status.DRAFT:
            return Response(
                {"error": "Only draft returns can be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SaleReturnItemSerializer(
            data=request.data,
            context={"sale_return": sale_return},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(sale_return=sale_return)

        total = sale_return.items.aggregate(
            total=Sum("refund_amount")
        )["total"] or Decimal("0.00")

        sale_return.refund_amount = total
        sale_return.save(update_fields=["refund_amount"])

        return Response(
            SaleReturnSerializer(sale_return).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="complete")
    @transaction.atomic
    def complete(self, request, pk=None):
        user = request.user
        is_manager = (
            user.is_superuser
            or getattr(user, "role", "")
            in ["ADMINISTRATOR", "STORE_MANAGER"]
        )
        if not is_manager:
            raise PermissionDenied(
                "Only a store manager or administrator can approve returns."
            )

        sale_return = SaleReturn.objects.select_for_update().get(pk=pk)
        sale = Sale.objects.select_for_update().get(pk=sale_return.sale_id)

        if sale_return.status != SaleReturn.Status.DRAFT:
            return Response(
                {"error": "This return is not a draft."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if sale.status != Sale.Status.COMPLETED:
            return Response(
                {"error": "Only completed sales can be returned."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return_items = list(
            sale_return.items.select_related(
                "sale_item__product"
            )
        )

        if not return_items:
            return Response(
                {"error": "Add at least one item before completing the return."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Lock original sale items and verify quantities.
        for return_item in return_items:
            original_item = SaleItem.objects.select_for_update().get(
                pk=return_item.sale_item_id
            )

            already_returned = SaleReturnItem.objects.filter(
                sale_item=original_item,
                sale_return__sale=sale,
                sale_return__status=SaleReturn.Status.COMPLETED,
            ).aggregate(total=Sum("quantity"))["total"] or Decimal("0")

            remaining = original_item.quantity - already_returned

            if return_item.quantity > remaining:
                return Response(
                    {
                        "error": (
                            f"Cannot return {return_item.quantity} units of "
                            f"{original_item.product.name}. "
                            f"Only {remaining} units remain eligible."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        total_refund = sum(
            (item.refund_amount for item in return_items),
            Decimal("0.00"),
        )

        payment_serializer = CompleteSaleReturnSerializer(data=request.data)
        payment_serializer.is_valid(raise_exception=True)

        payments = payment_serializer.validated_data["refund_payments"]
        payment_total = sum(
            (payment["amount"] for payment in payments),
            Decimal("0.00"),
        )

        if payment_total != total_refund:
            return Response(
                {
                    "error": "Refund payments must equal the return amount.",
                    "return_amount": str(total_refund),
                    "payment_total": str(payment_total),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Restore returned products to the original sale location.
        for item in return_items:
            change_stock(
                product=item.sale_item.product,
                location=sale.location,
                quantity_delta=item.quantity,
                movement_type=StockMovement.MovementType.CUSTOMER_RETURN,
                user=request.user,
                reference=sale_return.reference,
                notes=f"Customer return for sale {sale.reference}",
                unit_cost=item.sale_item.cost_price,
            )

        # Record refund payments.
        for payment in payments:
            SaleRefundPayment.objects.create(
                sale_return=sale_return,
                amount=payment["amount"],
                payment_method=payment["payment_method"],
                transaction_reference=payment.get(
                    "transaction_reference", ""
                ),
                processed_by=request.user,
            )

        sale_return.refund_amount = total_refund
        sale_return.status = SaleReturn.Status.COMPLETED
        sale_return.completed_at = timezone.now()
        sale_return.save(
            update_fields=[
                "refund_amount", "status", "completed_at"
            ]
        )

        return Response(SaleReturnSerializer(sale_return).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        sale_return = self.get_object()

        if sale_return.status != SaleReturn.Status.DRAFT:
            return Response(
                {"error": "Only draft returns can be cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sale_return.status = SaleReturn.Status.CANCELLED
        sale_return.save(update_fields=["status"])

        return Response(SaleReturnSerializer(sale_return).data)

class CashierShiftViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, ReadOnlyStaffRoles]
    serializer_class = CashierShiftSerializer

    def get_queryset(self):
        queryset = CashierShift.objects.select_related(
            "cashier", "location"
        ).prefetch_related("movements")

        user = self.request.user
        if user.is_superuser or getattr(user, "role", "") in [
            "ADMINISTRATOR",
            "STORE_MANAGER",
            "ACCOUNTANT",
            "AUDITOR",
        ]:
            return queryset

        return queryset.filter(cashier=user)

    def _require_shift_manager(self):
        user = self.request.user
        if not (
            user.is_superuser
            or getattr(user, "role", "") in [
                "ADMINISTRATOR", "STORE_MANAGER"
            ]
        ):
            raise PermissionDenied(
                "Only store managers or administrators can open cashier shifts."
            )

    @action(detail=False, methods=["get"], url_path="cashiers")
    def cashiers(self, request):
        self._require_shift_manager()
        user_model = get_user_model()
        cashier_users = user_model.objects.filter(
            role="CASHIER",
            is_active=True,
        ).order_by("username")

        return Response([
            {
                "id": cashier.id,
                "username": cashier.username,
                "name": cashier.get_full_name() or cashier.username,
            }
            for cashier in cashier_users
        ])

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        self._require_shift_manager()
        serializer = CashierShiftOpenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cashier = serializer.validated_data["cashier"]
        location = serializer.validated_data["location"]

        if CashierShift.objects.filter(
            cashier=cashier,
            status=CashierShift.Status.OPEN,
        ).exists():
            return Response(
                {"error": f"{cashier.username} already has an open shift."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shift = CashierShift.objects.create(
            cashier=cashier,
            location=location,
            opening_cash=serializer.validated_data["opening_cash"],
            expected_cash=serializer.validated_data["opening_cash"],
            notes=serializer.validated_data.get("notes", ""),
        )

        return Response(
            CashierShiftSerializer(shift).data,
            status=status.HTTP_201_CREATED,
        )

    def _calculate_expected_cash(self, shift, end_time):
        start_time = shift.opened_at

        cash_sales = SalePayment.objects.filter(
            sale__cashier=shift.cashier,
            sale__location=shift.location,
            sale__status=Sale.Status.COMPLETED,
            sale__completed_at__gte=start_time,
            sale__completed_at__lte=end_time,
            payment_method="CASH",
            received_by=shift.cashier,
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        cash_refunds = SaleRefundPayment.objects.filter(
            sale_return__sale__location=shift.location,
            sale_return__status=SaleReturn.Status.COMPLETED,
            processed_by=shift.cashier,
            created_at__gte=start_time,
            created_at__lte=end_time,
            payment_method="CASH",
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        cash_ins = shift.movements.filter(
            movement_type=CashMovement.MovementType.CASH_IN,
            created_at__gte=start_time,
            created_at__lte=end_time,
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        float_adjustments = shift.movements.filter(
            movement_type=CashMovement.MovementType.FLOAT_ADJUSTMENT,
            created_at__gte=start_time,
            created_at__lte=end_time,
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        cash_outs = shift.movements.filter(
            movement_type__in=[
                CashMovement.MovementType.CASH_OUT,
                CashMovement.MovementType.EXPENSE,
            ],
            created_at__gte=start_time,
            created_at__lte=end_time,
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        expected = (
            shift.opening_cash
            + cash_sales
            + cash_ins
            + float_adjustments
            - cash_refunds
            - cash_outs
        )

        return {
            "opening_cash": shift.opening_cash,
            "cash_sales": cash_sales,
            "cash_refunds": cash_refunds,
            "cash_in": cash_ins,
            "float_adjustments": float_adjustments,
            "cash_out_and_expenses": cash_outs,
            "expected_cash": expected,
        }

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="movements",
    )
    def movements(self, request, pk=None):
        shift = self.get_object()

        if request.method == "GET":
            serializer = CashMovementSerializer(
                shift.movements.all(), many=True
            )
            return Response(serializer.data)

        if shift.status != CashierShift.Status.OPEN:
            return Response(
                {"error": "Cannot record movements on a closed shift."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = CashMovementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data["movement_type"] == (
            CashMovement.MovementType.REFUND
        ):
            return Response(
                {"error": "Record refunds through the sales return workflow."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        movement = serializer.save(
            shift=shift,
            recorded_by=request.user,
        )

        return Response(
            CashMovementSerializer(movement).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="summary")
    def summary(self, request, pk=None):
        shift = self.get_object()
        end_time = shift.closed_at or timezone.now()

        summary = self._calculate_expected_cash(shift, end_time)

        return Response({
            "shift_id": shift.id,
            "cashier": shift.cashier.username,
            "location": shift.location.name,
            "status": shift.status,
            **{key: str(value) for key, value in summary.items()},
        })

    @action(detail=True, methods=["post"], url_path="close")
    @transaction.atomic
    def close(self, request, pk=None):
        shift = CashierShift.objects.select_for_update().get(pk=pk)

        # Apply the same access rule as get_queryset.
        user = request.user
        is_manager = (
            user.is_superuser
            or getattr(user, "role", "") in [
                "ADMINISTRATOR", "STORE_MANAGER"
            ]
        )

        if shift.cashier_id != user.id and not is_manager:
            return Response(
                {"error": "You cannot close another cashier's shift."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if shift.status != CashierShift.Status.OPEN:
            return Response(
                {"error": "This shift is already closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        closing_cash = request.data.get("closing_cash")

        if closing_cash is None:
            return Response(
                {"error": "Please provide the physical closing cash."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            closing_cash = Decimal(str(closing_cash))
        except Exception:
            return Response(
                {"error": "Enter a valid closing cash amount."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not closing_cash.is_finite() or closing_cash < 0:
            return Response(
                {"error": "Closing cash must be a valid non-negative amount."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        end_time = timezone.now()
        summary = self._calculate_expected_cash(shift, end_time)

        expected_cash = summary["expected_cash"]
        difference = closing_cash - expected_cash

        shift.expected_cash = expected_cash
        shift.closing_cash = closing_cash
        shift.difference = difference
        shift.status = CashierShift.Status.CLOSED
        shift.closed_at = end_time
        shift.save(update_fields=[
            "expected_cash", "closing_cash", "difference",
            "status", "closed_at",
        ])

        return Response({
            "message": "Cashier shift closed successfully.",
            "shift": CashierShiftSerializer(shift).data,
            "reconciliation": {
                **{key: str(value) for key, value in summary.items()},
                "closing_cash": str(closing_cash),
                "difference": str(difference),
                "result": (
                    "BALANCED" if difference == 0
                    else "SURPLUS" if difference > 0
                    else "SHORTAGE"
                ),
            },
        })


class MpesaInitiateAPIView(APIView):
    permission_classes = [IsAuthenticated, ReadOnlyStaffRoles]

    def post(self, request):
        sale_id = request.data.get("sale_id")
        phone = request.data.get("phone_number")

        if not sale_id or not phone:
            return Response(
                {"error": "sale_id and phone_number are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            phone = normalize_mpesa_phone(phone)
        except ValueError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            try:
                sale = Sale.objects.select_for_update().get(pk=sale_id)
            except Sale.DoesNotExist:
                return Response(
                    {"error": "Sale not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            is_manager = (
                request.user.is_superuser
                or getattr(request.user, "role", "") in [
                    "ADMINISTRATOR", "STORE_MANAGER"
                ]
            )

            if sale.cashier_id != request.user.id and not is_manager:
                return Response(
                    {"error": "You cannot initiate payment for this sale."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if sale.status != Sale.Status.DRAFT:
                return Response(
                    {"error": "Only draft sales can receive payment."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            sale.recalculate_totals()
            amount = sale.total_amount

            if amount <= 0 or amount != amount.to_integral_value():
                return Response(
                    {
                        "error": (
                            "M-Pesa STK Push requires a positive whole "
                            "number of Kenyan shillings. Adjust the sale "
                            "total before initiating payment."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not sale.items.exists():
                return Response(
                    {"error": "Add products before requesting payment."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if sale.mpesa_transactions.filter(
                status=MpesaTransaction.Status.PENDING
            ).exists():
                return Response(
                    {
                        "error":
                            "An M-Pesa request is already pending for this sale."
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            mpesa_transaction = MpesaTransaction.objects.create(
                sale=sale,
                phone_number=phone,
                amount=amount,
            )

        try:
            result = initiate_stk_push(
                phone=phone,
                amount=amount,
                account_reference=sale.reference,
            )

            if str(result.get("ResponseCode")) != "0":
                mpesa_transaction.status = MpesaTransaction.Status.FAILED
                mpesa_transaction.result_description = (
                    result.get("ResponseDescription", "STK Push rejected.")
                )
                mpesa_transaction.callback_data = result
                mpesa_transaction.save()

                return Response(
                    {
                        "error": mpesa_transaction.result_description,
                        "daraja_response": result,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            mpesa_transaction.merchant_request_id = (
                result.get("MerchantRequestID", "")
            )
            mpesa_transaction.checkout_request_id = (
                result.get("CheckoutRequestID")
            )
            mpesa_transaction.save()

            return Response(
                {
                    "message": (
                        "STK Push sent. Ask the customer to enter their "
                        "M-Pesa PIN."
                    ),
                    "transaction_id": str(mpesa_transaction.id),
                    "checkout_request_id":
                        mpesa_transaction.checkout_request_id,
                    "customer_message": result.get("CustomerMessage", ""),
                    "status": mpesa_transaction.status,
                },
                status=status.HTTP_202_ACCEPTED,
            )

        except Exception as exc:
            mpesa_transaction.status = MpesaTransaction.Status.FAILED
            mpesa_transaction.result_description = str(exc)
            mpesa_transaction.save()

            return Response(
                {
                    "error": str(exc)
                    if isinstance(exc, (MpesaRequestError, ValueError))
                    else (
                        "Could not send STK Push. Check Daraja "
                        "configuration and try again."
                    ),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )


class MpesaStatusAPIView(APIView):
    permission_classes = [IsAuthenticated, ReadOnlyStaffRoles]

    def get(self, request, transaction_id):
        try:
            mpesa_transaction = MpesaTransaction.objects.select_related(
                "sale"
            ).get(pk=transaction_id)
        except MpesaTransaction.DoesNotExist:
            return Response(
                {"error": "M-Pesa transaction not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        user = request.user
        is_manager = (
            user.is_superuser
            or getattr(user, "role", "") in [
                "ADMINISTRATOR", "STORE_MANAGER"
            ]
        )

        if mpesa_transaction.sale.cashier_id != user.id and not is_manager:
            return Response(
                {"error": "You cannot view this transaction."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response({
            "transaction_id": str(mpesa_transaction.id),
            "sale_reference": mpesa_transaction.sale.reference,
            "amount": str(mpesa_transaction.amount),
            "phone_number": mpesa_transaction.phone_number,
            "status": mpesa_transaction.status,
            "receipt_number": mpesa_transaction.mpesa_receipt_number,
            "result_description": mpesa_transaction.result_description,
            "processing_error": mpesa_transaction.processing_error,
        })


class MpesaCallbackAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        callback = request.data.get("Body", {}).get("stkCallback", {})

        checkout_id = callback.get("CheckoutRequestID")
        if not checkout_id:
            return Response(
                {"ResultCode": 0, "ResultDesc": "Accepted"},
                status=status.HTTP_200_OK,
            )

        try:
            with transaction.atomic():
                mpesa_transaction = MpesaTransaction.objects.select_for_update().get(
                    checkout_request_id=checkout_id
                )

                if mpesa_transaction.status != MpesaTransaction.Status.PENDING:
                    return Response(
                        {"ResultCode": 0, "ResultDesc": "Already processed"},
                        status=status.HTTP_200_OK,
                    )

                result_code = str(callback.get("ResultCode", ""))
                mpesa_transaction.result_code = result_code
                mpesa_transaction.result_description = callback.get(
                    "ResultDesc", ""
                )
                mpesa_transaction.callback_data = request.data

                if result_code != "0":
                    mpesa_transaction.status = MpesaTransaction.Status.FAILED
                    mpesa_transaction.save()
                    return Response(
                        {"ResultCode": 0, "ResultDesc": "Accepted"},
                        status=status.HTTP_200_OK,
                    )

                items = callback.get(
                    "CallbackMetadata", {}
                ).get("Item", [])
                metadata = {
                    item.get("Name"): item.get("Value")
                    for item in items
                }

                try:
                    paid_amount = Decimal(str(metadata["Amount"]))
                    receipt_number = str(metadata["MpesaReceiptNumber"])
                    paid_phone = normalize_mpesa_phone(
                        metadata["PhoneNumber"]
                    )
                except (KeyError, ValueError, TypeError):
                    mpesa_transaction.status = MpesaTransaction.Status.REVIEW
                    mpesa_transaction.processing_error = (
                        "Successful callback was missing valid amount, "
                        "receipt number or phone number."
                    )
                    mpesa_transaction.save()
                    return Response(
                        {"ResultCode": 0, "ResultDesc": "Accepted"},
                        status=status.HTTP_200_OK,
                    )

                if (
                    paid_amount != mpesa_transaction.amount
                    or paid_phone != mpesa_transaction.phone_number
                    or not receipt_number
                ):
                    mpesa_transaction.status = MpesaTransaction.Status.REVIEW
                    mpesa_transaction.processing_error = (
                        "Callback amount, phone or receipt did not match "
                        "the pending transaction."
                    )
                    mpesa_transaction.save()
                    return Response(
                        {"ResultCode": 0, "ResultDesc": "Accepted"},
                        status=status.HTTP_200_OK,
                    )

                sale = Sale.objects.select_for_update().get(
                    pk=mpesa_transaction.sale_id
                )

                if sale.status != Sale.Status.DRAFT:
                    mpesa_transaction.status = MpesaTransaction.Status.REVIEW
                    mpesa_transaction.processing_error = (
                        "Payment succeeded, but the sale was no longer a draft. "
                        "Manual reconciliation is required."
                    )
                    mpesa_transaction.mpesa_receipt_number = receipt_number
                    mpesa_transaction.save()
                    return Response(
                        {"ResultCode": 0, "ResultDesc": "Accepted"},
                        status=status.HTTP_200_OK,
                    )

                SalePayment.objects.create(
                    sale=sale,
                    payment_method=SalePayment.PaymentMethod.MPESA,
                    amount=paid_amount,
                    transaction_reference=receipt_number,
                    received_by=sale.cashier,
                )

                try:
                    with transaction.atomic():
                        sale.recalculate_totals()

                        if sale.total_amount != paid_amount:
                            raise ValueError(
                                "Sale total changed while M-Pesa payment "
                                "was pending."
                            )

                        items = list(
                            sale.items.select_related("product").all()
                        )
                        if not items:
                            raise ValueError("The sale has no items.")

                        for item in items:
                            change_stock(
                                product=item.product,
                                location=sale.location,
                                quantity_delta=-item.quantity,
                                movement_type=StockMovement.MovementType.ISSUE,
                                user=sale.cashier,
                                reference=sale.reference,
                                notes="M-Pesa POS sale",
                                unit_cost=item.cost_price,
                            )

                        sale.status = Sale.Status.COMPLETED
                        sale.completed_at = timezone.now()
                        sale.save(
                            update_fields=["status", "completed_at"]
                        )

                except Exception as exc:
                    mpesa_transaction.processing_error = (
                        "Payment was received, but sale completion failed: "
                        + str(exc)
                    )

                mpesa_transaction.status = MpesaTransaction.Status.SUCCESS
                mpesa_transaction.mpesa_receipt_number = receipt_number
                mpesa_transaction.save()

        except MpesaTransaction.DoesNotExist:
            pass

        return Response(
            {"ResultCode": 0, "ResultDesc": "Accepted"},
            status=status.HTTP_200_OK,
        )