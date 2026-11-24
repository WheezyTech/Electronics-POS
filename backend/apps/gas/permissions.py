from rest_framework.permissions import BasePermission


class GasAuthorizedPermission(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        if request.user.is_superuser:
            return True
        return getattr(request.user, "role", "") in ("ADMINISTRATOR", "STORE_MANAGER")


class GasTransactionPermission(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        if request.user.is_superuser:
            return True
        return getattr(request.user, "role", "") in (
            "ADMINISTRATOR",
            "STORE_MANAGER",
            "CASHIER",
            "GAS_LPG_CASHIER",
            "SUPERVISOR",
        )
