
from rest_framework.permissions import BasePermission, SAFE_METHODS


class ReadOnlyStaffRoles(BasePermission):
    message = "Accountant and auditor accounts have read-only access."

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return True
        if user.role in {"ACCOUNTANT", "AUDITOR"}:
            return request.method in SAFE_METHODS
        return True


class IsAdministrator(BasePermission):
    message = "Administrator access required."

    def has_permission(self, request, view):
        user = request.user

        return (
            user.is_authenticated
            and (
                user.is_superuser
                or user.role == "ADMINISTRATOR"
            )
        )


class IsStoreManager(BasePermission):
    message = "Store Manager access required."

    def has_permission(self, request, view):
        user = request.user

        return (
            user.is_authenticated
            and (
                user.is_superuser
                or user.role in [
                    "ADMINISTRATOR",
                    "STORE_MANAGER",
                ]
            )
        )


class IsCashier(BasePermission):
    message = "Cashier access required."

    def has_permission(self, request, view):
        user = request.user

        return (
            user.is_authenticated
            and (
                user.is_superuser
                or user.role in [
                    "ADMINISTRATOR",
                    "CASHIER",
                ]
            )
        )
