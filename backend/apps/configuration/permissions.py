from rest_framework.permissions import BasePermission


class IsAdministrator(BasePermission):
    message = "Only administrators can modify business settings."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == "ADMINISTRATOR"
        )