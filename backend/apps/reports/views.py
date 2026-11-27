from decimal import Decimal

from django.db.models import (
    Sum, Count, F, Q, Case, When, DecimalField, ExpressionWrapper, Value
)
from django.db.models.functions import TruncDate, Coalesce
from django.utils.dateparse import parse_date
from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.response import Response

from apps.sales.models import (
    Sale, SaleItem, SalePayment, SaleRefundPayment, SaleReturn,
    CashierShift,
)
from apps.inventory.models import StockBalance, StockLocation
from apps.products.models import Product
from apps.purchases.models import (
    SupplierInvoice, SupplierPayment, Supplier
)
from apps.gas.models import (
    GasExchange,
    GasPayment,
    GasRefill,
    NewCylinderSale,
)

from rest_framework.permissions import BasePermission


class IsManagementUser(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return (
            user.is_authenticated
            and (
                user.is_superuser
                or getattr(user, "role", "") in [
                    "ADMINISTRATOR",
                    "STORE_MANAGER",
                    "ACCOUNTANT",
                    "AUDITOR",
                ]
            )
        )

MONEY_FIELD = DecimalField(max_digits=18, decimal_places=2)
ZERO = Value(Decimal("0.00"), output_field=MONEY_FIELD)


def get_date_range(request):
    """
    Optional query parameters:
    ?date_from=2026-11-01&date_to=2026-11-30
    """
    date_from = request.query_params.get("date_from")
    date_to = request.query_params.get("date_to")

    parsed_from = parse_date(date_from) if date_from else None
    parsed_to = parse_date(date_to) if date_to else None

    if date_from and not parsed_from:
        return None, None, "Invalid date_from. Use YYYY-MM-DD."

    if date_to and not parsed_to:
        return None, None, "Invalid date_to. Use YYYY-MM-DD."

    if parsed_from and parsed_to and parsed_from > parsed_to:
        return None, None, "date_from cannot be after date_to."

    return parsed_from, parsed_to, None


def apply_date_filter(queryset, field, date_from, date_to):
    if date_from:
        queryset = queryset.filter(**{f"{field}__date__gte": date_from})
    if date_to:
        queryset = queryset.filter(**{f"{field}__date__lte": date_to})
    return queryset


class DashboardOverviewAPIView(APIView):
    permission_classes = [IsManagementUser]

    def get(self, request):
        date_from, date_to, error = get_date_range(request)

        if error:
            return Response({"error": error}, status=400)

        category_id = request.query_params.get("category")
        sector = request.query_params.get("sector")
        sales = Sale.objects.filter(status=Sale.Status.COMPLETED)
        sales = apply_date_filter(
            sales, "completed_at", date_from, date_to
        )
        if category_id:
            sales = sales.filter(
                items__product__category_id=category_id
            ).distinct()
        if sector == "ELECTRONICS":
            sales = sales.exclude(
                items__product__category__name__iregex=r".*(gas|lpg).*"
            )
        elif sector == "GAS_LPG":
            sales = sales.filter(
                items__product__category__name__iregex=r".*(gas|lpg).*"
            ).distinct()

        completed_returns = SaleReturn.objects.filter(
            status=SaleReturn.Status.COMPLETED
        )
        completed_returns = apply_date_filter(
            completed_returns, "completed_at", date_from, date_to
        )
        if category_id:
            completed_returns = completed_returns.filter(
                sale__items__product__category_id=category_id
            ).distinct()

        sale_items = SaleItem.objects.filter(
            sale__in=sales
        )
        if category_id:
            sale_items = sale_items.filter(
                product__category_id=category_id
            )

        totals = sales.aggregate(
            sales_count=Count("id"),
            revenue=Coalesce(Sum("total_amount"), ZERO),
            discounts=Coalesce(Sum("discount_amount"), ZERO),
            tax=Coalesce(Sum("tax_amount"), ZERO),
        )
        refund_total = completed_returns.aggregate(
            total=Coalesce(Sum("refund_amount"), ZERO)
        )["total"]

        profit_expression = ExpressionWrapper(
            F("quantity") * (F("unit_price") - F("cost_price"))
            - F("discount_amount"),
            output_field=MONEY_FIELD,
        )

        gross_profit = sale_items.aggregate(
            total=Coalesce(Sum(profit_expression), ZERO)
        )["total"]

        payment_breakdown = {}
        sale_payment_totals = SalePayment.objects.filter(
            sale__in=sales
        ).values("payment_method").annotate(
            total=Sum("amount"),
            transactions=Count("id"),
        )
        for row in sale_payment_totals:
            payment_breakdown[row["payment_method"]] = {
                "collected": row["total"],
                "refunds": Decimal("0.00"),
                "transactions": row["transactions"],
                "refund_transactions": 0,
            }

        refund_payment_totals = SaleRefundPayment.objects.filter(
            sale_return__in=completed_returns
        ).values("payment_method").annotate(
            total=Sum("amount"),
            transactions=Count("id"),
        )
        for row in refund_payment_totals:
            method = row["payment_method"]
            if method not in payment_breakdown:
                payment_breakdown[method] = {
                    "collected": Decimal("0.00"),
                    "refunds": Decimal("0.00"),
                    "transactions": 0,
                    "refund_transactions": 0,
                }
            payment_breakdown[method]["refunds"] = row["total"]
            payment_breakdown[method]["refund_transactions"] = (
                row["transactions"]
            )

        daily_sales = sales.filter(
            completed_at__isnull=False
        ).annotate(
            day=TruncDate("completed_at")
        ).values("day").annotate(
            sales_count=Count("id"),
            revenue=Sum("total_amount"),
        )
        daily_revenue = {}
        for row in daily_sales:
            daily_revenue[row["day"]] = {
                "transactions": row["sales_count"],
                "revenue": row["revenue"],
            }

        daily_refunds = completed_returns.filter(
            completed_at__isnull=False
        ).annotate(
            day=TruncDate("completed_at")
        ).values("day").annotate(
            refunds=Sum("refund_amount")
        )
        for row in daily_refunds:
            day = row["day"]
            if day not in daily_revenue:
                daily_revenue[day] = {
                    "transactions": 0,
                    "revenue": Decimal("0.00"),
                }
            daily_revenue[day]["revenue"] -= row["refunds"]

        top_products = sale_items.values(
            "product_id", "product__name", "product__sku"
        ).annotate(
            quantity_sold=Sum("quantity"),
            revenue=Sum(
                ExpressionWrapper(
                    F("quantity") * F("unit_price")
                    - F("discount_amount"),
                    output_field=MONEY_FIELD,
                )
            ),
        ).order_by("-quantity_sold")[:10]

        cashier_performance = sales.values(
            "cashier_id", "cashier__username"
        ).annotate(
            sales_count=Count("id"),
            revenue=Sum("total_amount"),
        ).order_by("-revenue")

        gas_payments = GasPayment.objects.all()
        if date_from:
            gas_payments = gas_payments.filter(
                Q(gas_refill__created_at__date__gte=date_from)
                | Q(gas_exchange__created_at__date__gte=date_from)
                | Q(cylinder_sale__created_at__date__gte=date_from)
            )
        if date_to:
            gas_payments = gas_payments.filter(
                Q(gas_refill__created_at__date__lte=date_to)
                | Q(gas_exchange__created_at__date__lte=date_to)
                | Q(cylinder_sale__created_at__date__lte=date_to)
            )
        gas_payment_breakdown = gas_payments.values(
            "payment_method"
        ).annotate(
            collected=Coalesce(Sum("amount"), ZERO),
            transactions=Count("id"),
        ).order_by("payment_method")

        gas_cashier_totals = {}

        def add_gas_cashier_totals(queryset, revenue_expression):
            rows = queryset.values(
                "recorded_by_id",
                "recorded_by__username",
            ).annotate(
                transactions=Count("id"),
                revenue=Coalesce(
                    Sum(ExpressionWrapper(
                        revenue_expression,
                        output_field=MONEY_FIELD,
                    )),
                    ZERO,
                ),
            )
            for row in rows:
                cashier_id = row["recorded_by_id"]
                totals_for_cashier = gas_cashier_totals.setdefault(
                    cashier_id,
                    {
                        "cashier_id": cashier_id,
                        "cashier": row["recorded_by__username"],
                        "transactions": 0,
                        "revenue": Decimal("0.00"),
                    },
                )
                totals_for_cashier["transactions"] += row["transactions"]
                totals_for_cashier["revenue"] += row["revenue"]

        tax_if_excluded = Case(
            When(tax_included=False, then=F("tax_amount")),
            default=Value(Decimal("0.00"), output_field=MONEY_FIELD),
            output_field=MONEY_FIELD,
        )
        gas_refills = apply_date_filter(
            GasRefill.objects.all(),
            "created_at",
            date_from,
            date_to,
        )
        gas_exchanges = apply_date_filter(
            GasExchange.objects.all(),
            "created_at",
            date_from,
            date_to,
        )
        gas_cylinder_sales = apply_date_filter(
            NewCylinderSale.objects.all(),
            "created_at",
            date_from,
            date_to,
        )
        add_gas_cashier_totals(
            gas_refills,
            F("total_amount") + tax_if_excluded,
        )
        add_gas_cashier_totals(
            gas_exchanges,
            F("refill_payment") + tax_if_excluded,
        )
        add_gas_cashier_totals(
            gas_cylinder_sales,
            F("selling_price") * F("quantity")
            + F("accessories_total")
            + tax_if_excluded,
        )

        return Response({
            "period": {
                "date_from": date_from,
                "date_to": date_to,
            },
            "sales": {
                "transactions": totals["sales_count"],
                "gross_revenue": str(totals["revenue"]),
                "refunds": str(refund_total),
                "revenue": str(totals["revenue"] - refund_total),
                "discounts": str(totals["discounts"]),
                "tax": str(totals["tax"]),
                "gross_profit": str(gross_profit),
            },
            "payment_breakdown": [
                {
                    "payment_method": method,
                    "collected": str(values["collected"]),
                    "refunds": str(values["refunds"]),
                    "total": str(values["collected"] - values["refunds"]),
                    "transactions": values["transactions"],
                    "refund_transactions": values["refund_transactions"],
                }
                for method, values in sorted(payment_breakdown.items())
            ],
            "gas_payment_breakdown": [
                {
                    "payment_method": row["payment_method"],
                    "collected": str(row["collected"]),
                    "transactions": row["transactions"],
                }
                for row in gas_payment_breakdown
            ],
            "daily_sales": [
                {
                    "date": day,
                    "transactions": values["transactions"],
                    "revenue": str(values["revenue"]),
                }
                for day, values in sorted(daily_revenue.items())
            ],
            "top_products": [
                {
                    "product_id": row["product_id"],
                    "name": row["product__name"],
                    "sku": row["product__sku"],
                    "quantity_sold": str(row["quantity_sold"]),
                    "revenue": str(row["revenue"]),
                }
                for row in top_products
            ],
            "cashier_performance": [
                {
                    "cashier_id": row["cashier_id"],
                    "cashier": row["cashier__username"],
                    "transactions": row["sales_count"],
                    "revenue": str(row["revenue"]),
                }
                for row in cashier_performance
            ],
            "gas_cashier_performance": [
                {
                    **row,
                    "revenue": str(row["revenue"]),
                }
                for row in sorted(
                    gas_cashier_totals.values(),
                    key=lambda item: item["revenue"],
                    reverse=True,
                )
            ],
        })


class InventoryReportAPIView(APIView):
    permission_classes = [IsManagementUser]

    def get(self, request):
        category_id = request.query_params.get("category")
        balances = StockBalance.objects.select_related(
            "product", "location"
        ).filter(product__is_active=True)
        if category_id:
            balances = balances.filter(product__category_id=category_id)

        valuation_expression = ExpressionWrapper(
            F("quantity_on_hand") * F("product__cost_price"),
            output_field=MONEY_FIELD,
        )

        valuation = balances.aggregate(
            total=Coalesce(Sum(valuation_expression), ZERO)
        )["total"]

        stock_summary = balances.aggregate(
            products=Count("product", distinct=True),
            units=Coalesce(Sum("quantity_on_hand"), ZERO),
            reserved=Coalesce(Sum("quantity_reserved"), ZERO),
        )
        active_products = Product.objects.filter(is_active=True)
        if category_id:
            active_products = active_products.filter(category_id=category_id)
        active_product_count = active_products.count()
        stocked_product_ids = balances.filter(
            quantity_on_hand__gt=0
        ).values("product_id")
        out_of_stock_count = active_products.exclude(
            id__in=stocked_product_ids
        ).count()

        low_stock = balances.filter(
            quantity_on_hand__lte=F("quantity_reserved")
            + F("product__reorder_level")
        ).order_by("product__name")

        low_stock_data = [
            {
                "product_id": row.product_id,
                "product": row.product.name,
                "sku": row.product.sku,
                "location_id": row.location_id,
                "location": row.location.name,
                "quantity_on_hand": str(row.quantity_on_hand),
                "quantity_reserved": str(row.quantity_reserved),
                "quantity_available": str(row.quantity_available),
                "reorder_level": str(row.product.reorder_level),
            }
            for row in low_stock
        ]

        location_summary = balances.values(
            "location_id", "location__name"
        ).annotate(
            products=Count("product", distinct=True),
            units=Sum("quantity_on_hand"),
        ).order_by("location__name")

        return Response({
            "stock": {
                "products": stock_summary["products"],
                "active_products": active_product_count,
                "out_of_stock_products": out_of_stock_count,
                "units_on_hand": str(stock_summary["units"]),
                "units_reserved": str(stock_summary["reserved"]),
                "estimated_cost_value": str(valuation),
            },
            "low_stock_count": len(low_stock_data),
            "low_stock": low_stock_data,
            "locations": [
                {
                    "location_id": row["location_id"],
                    "location": row["location__name"],
                    "products": row["products"],
                    "units_on_hand": str(row["units"] or 0),
                }
                for row in location_summary
            ],
        })


class PurchasingReportAPIView(APIView):
    permission_classes = [IsManagementUser]

    def get(self, request):
        invoices = SupplierInvoice.objects.filter(
            status=SupplierInvoice.Status.POSTED
        ).select_related("supplier")

        date_from, date_to, error = get_date_range(request)

        if error:
            return Response({"error": error}, status=400)

        if date_from:
            invoices = invoices.filter(invoice_date__gte=date_from)
        if date_to:
            invoices = invoices.filter(invoice_date__lte=date_to)

        invoice_total = Decimal("0.00")
        amount_paid = Decimal("0.00")
        outstanding = Decimal("0.00")
        overdue_total = Decimal("0.00")

        supplier_totals = {}

        for invoice in invoices:
            paid = invoice.amount_paid
            balance = invoice.total_amount - paid

            invoice_total += invoice.total_amount
            amount_paid += paid
            outstanding += balance

            if invoice.is_overdue and balance > 0:
                overdue_total += balance

            supplier_id = invoice.supplier_id

            if supplier_id not in supplier_totals:
                supplier_totals[supplier_id] = {
                    "supplier": invoice.supplier.name,
                    "invoiced": Decimal("0.00"),
                    "paid": Decimal("0.00"),
                    "outstanding": Decimal("0.00"),
                }

            supplier_totals[supplier_id]["invoiced"] += invoice.total_amount
            supplier_totals[supplier_id]["paid"] += paid
            supplier_totals[supplier_id]["outstanding"] += balance

        return Response({
            "period": {
                "date_from": date_from,
                "date_to": date_to,
            },
            "purchasing": {
                "invoice_count": invoices.count(),
                "invoiced": str(invoice_total),
                "paid": str(amount_paid),
                "outstanding": str(outstanding),
                "overdue": str(overdue_total),
            },
            "suppliers": [
                {
                    "supplier_id": supplier_id,
                    "supplier": values["supplier"],
                    "invoiced": str(values["invoiced"]),
                    "paid": str(values["paid"]),
                    "outstanding": str(values["outstanding"]),
                }
                for supplier_id, values in supplier_totals.items()
            ],
        })