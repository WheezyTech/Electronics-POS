
import uuid
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import F

from .models import (
    StockLocation,
    StockBalance,
    StockMovement,
)


INCREASE_TYPES = {
    StockMovement.MovementType.RECEIPT,
    StockMovement.MovementType.TRANSFER_IN,
    StockMovement.MovementType.CUSTOMER_RETURN,
}

DECREASE_TYPES = {
    StockMovement.MovementType.ISSUE,
    StockMovement.MovementType.TRANSFER_OUT,
    StockMovement.MovementType.SUPPLIER_RETURN,
    StockMovement.MovementType.DAMAGE,
}


@transaction.atomic
def change_stock(
    *,
    product,
    location,
    quantity_delta,
    movement_type,
    user,
    reference="",
    notes="",
    unit_cost=None,
    transaction_id=None,
):
    """
    Update stock and create its permanent movement record.

    Positive delta = stock increases.
    Negative delta = stock decreases.

    ADJUSTMENT supports either direction.
    """

    try:
        delta = Decimal(str(quantity_delta))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid stock quantity.")

    if not delta.is_finite() or delta == 0:
        raise ValueError("Stock quantity must be a non-zero number.")

    if delta.as_tuple().exponent < -3:
        raise ValueError("Stock quantity supports up to 3 decimal places.")

    if movement_type in INCREASE_TYPES and delta < 0:
        raise ValueError("This movement type must increase stock.")

    if movement_type in DECREASE_TYPES and delta > 0:
        raise ValueError("This movement type must decrease stock.")

    if movement_type not in (
        INCREASE_TYPES
        | DECREASE_TYPES
        | {StockMovement.MovementType.ADJUSTMENT}
    ):
        raise ValueError("Unsupported stock movement type.")

    if not location.is_active:
        raise ValueError("Stock location is inactive.")

    if not product.is_active:
        raise ValueError("Product is inactive.")

    if not user.is_authenticated:
        raise ValueError("An authenticated user is required.")

    if unit_cost is not None:
        unit_cost = Decimal(str(unit_cost))

        if not unit_cost.is_finite() or unit_cost < 0:
            raise ValueError("Unit cost must be a valid non-negative amount.")

    # Create the balance if this is the first stock movement.
    StockBalance.objects.get_or_create(
        product=product,
        location=location,
    )

    # Lock the balance to prevent simultaneous stock updates.
    balance = StockBalance.objects.select_for_update().get(
        product=product,
        location=location,
    )

    before = balance.quantity_on_hand
    after = before + delta

    if after < 0:
        raise ValueError(
            f"Insufficient stock. Available quantity: "
            f"{balance.quantity_available}"
        )

    if after < balance.quantity_reserved:
        raise ValueError(
            "This operation would reduce stock below reserved quantity."
        )

    balance.quantity_on_hand = after
    balance.save(update_fields=[
        "quantity_on_hand",
        "updated_at",
    ])

    movement = StockMovement.objects.create(
        transaction_id=transaction_id or uuid.uuid4(),
        balance=balance,
        movement_type=movement_type,
        quantity_delta=delta,
        quantity_before=before,
        quantity_after=after,
        unit_cost=unit_cost,
        reference=reference,
        notes=notes,
        performed_by=user,
    )

    return movement


@transaction.atomic
def transfer_stock(
    *,
    product,
    source,
    destination,
    quantity,
    user,
    reference="",
    notes="",
):
    """
    Transfer stock between two locations.

    Both movements succeed together or neither succeeds.
    """

    if source.pk == destination.pk:
        raise ValueError("Source and destination must be different.")

    if not source.is_active or not destination.is_active:
        raise ValueError("Both stock locations must be active.")

    transaction_id = uuid.uuid4()

    outgoing = change_stock(
        product=product,
        location=source,
        quantity_delta=-Decimal(str(quantity)),
        movement_type=StockMovement.MovementType.TRANSFER_OUT,
        user=user,
        reference=reference,
        notes=notes,
        transaction_id=transaction_id,
    )

    incoming = change_stock(
        product=product,
        location=destination,
        quantity_delta=Decimal(str(quantity)),
        movement_type=StockMovement.MovementType.TRANSFER_IN,
        user=user,
        reference=reference,
        notes=notes,
        transaction_id=transaction_id,
    )

    return outgoing, incoming


@transaction.atomic
def update_stock_movement(
    *,
    movement,
    quantity_delta,
    movement_type,
    reference,
    notes,
    unit_cost,
):
    """Edit a movement and rebuild affected balances from its ledger."""
    movement = StockMovement.objects.get(pk=movement.pk)
    related_movements = [movement]
    if movement.movement_type in {
        StockMovement.MovementType.TRANSFER_IN,
        StockMovement.MovementType.TRANSFER_OUT,
    }:
        related_movements = list(
            StockMovement.objects.filter(transaction_id=movement.transaction_id)
            .order_by("id")
        )
        if len(related_movements) != 2:
            raise ValueError("The related stock transfer is incomplete.")

    balance_ids = sorted({item.balance_id for item in related_movements})
    balances = {
        balance.pk: balance
        for balance in StockBalance.objects.select_for_update()
        .filter(pk__in=balance_ids)
        .order_by("pk")
    }
    related_movements = list(
        StockMovement.objects.select_for_update()
        .filter(pk__in=[item.pk for item in related_movements])
        .order_by("id")
    )
    movement = next(item for item in related_movements if item.pk == movement.pk)

    try:
        delta = Decimal(str(quantity_delta))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid stock quantity.")

    if not delta.is_finite() or delta == 0:
        raise ValueError("Stock quantity must be a non-zero number.")
    if delta.as_tuple().exponent < -3:
        raise ValueError("Stock quantity supports up to 3 decimal places.")

    allowed_types = (
        INCREASE_TYPES
        | DECREASE_TYPES
        | {StockMovement.MovementType.ADJUSTMENT}
    )
    if movement_type not in allowed_types:
        raise ValueError("Unsupported stock movement type.")
    if movement_type in INCREASE_TYPES and delta < 0:
        raise ValueError("This movement type must increase stock.")
    if movement_type in DECREASE_TYPES and delta > 0:
        raise ValueError("This movement type must decrease stock.")

    if len(related_movements) == 2:
        if movement_type not in {
            StockMovement.MovementType.TRANSFER_IN,
            StockMovement.MovementType.TRANSFER_OUT,
        }:
            raise ValueError("Transfer movement types cannot be changed.")
        if (movement_type == StockMovement.MovementType.TRANSFER_IN) != (
            movement.movement_type == StockMovement.MovementType.TRANSFER_IN
        ):
            raise ValueError("A transfer movement direction cannot be changed.")
    elif movement_type in {
        StockMovement.MovementType.TRANSFER_IN,
        StockMovement.MovementType.TRANSFER_OUT,
    }:
        raise ValueError(
            "A stock movement cannot be changed into a transfer."
        )

    try:
        cost = Decimal(str(unit_cost)) if unit_cost is not None else None
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid unit cost.")
    if cost is not None and (not cost.is_finite() or cost < 0):
        raise ValueError("Unit cost must be a valid non-negative amount.")

    if len(related_movements) == 2:
        for related in related_movements:
            related.quantity_delta = (
                abs(delta)
                if related.movement_type == StockMovement.MovementType.TRANSFER_IN
                else -abs(delta)
            )
            related.reference = reference
            related.notes = notes
            related.unit_cost = cost
    else:
        movement.quantity_delta = delta
        movement.movement_type = movement_type
        movement.reference = reference
        movement.notes = notes
        movement.unit_cost = cost

    modified_movements = {
        item.pk: item for item in related_movements
    }
    for balance_id in balance_ids:
        history = list(
            StockMovement.objects.select_for_update()
            .filter(balance_id=balance_id)
            .order_by("created_at", "id")
        )
        history = [
            modified_movements.get(item.pk, item)
            for item in history
        ]
        quantity = history[0].quantity_before
        for item in history:
            before = quantity
            after = before + item.quantity_delta
            if after < 0:
                raise ValueError(
                    "This edit would make a later stock movement negative."
                )
            modified = item.pk in modified_movements
            if (
                modified
                or item.quantity_before != before
                or item.quantity_after != after
            ):
                item.quantity_before = before
                item.quantity_after = after
                update_fields = ["quantity_before", "quantity_after"]
                if modified:
                    update_fields.extend([
                        "quantity_delta", "movement_type", "reference",
                        "notes", "unit_cost",
                    ])
                item.save(update_fields=update_fields)
            quantity = after

        balance = balances[balance_id]
        if quantity < balance.quantity_reserved:
            raise ValueError(
                "This edit would reduce stock below reserved quantity."
            )
        if balance.quantity_on_hand != quantity:
            balance.quantity_on_hand = quantity
            balance.save(update_fields=["quantity_on_hand", "updated_at"])

    return movement
