
from rest_framework.permissions import BasePermission, SAFE_METHODS


class SupplierPermission(BasePermission):

    def has_permission(self, request, view):

        user = request.user

        if not user or not user.is_authenticated:
            return False

        if request.method in SAFE_METHODS:
            return True

        return (
            user.is_superuser
            or user.role in ["ADMINISTRATOR", "STORE_MANAGER"]
        )


class PurchaseOrderPermission(BasePermission):

    def has_permission(self, request, view):

        user = request.user

        if not user or not user.is_authenticated:
            return False

        if request.method in SAFE_METHODS:
            return True

        return (
            user.is_superuser
            or user.role in ["ADMINISTRATOR", "STORE_MANAGER"]
        )
