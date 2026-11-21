from django.contrib.auth.backends import ModelBackend


class AdministratorPermissionsBackend(ModelBackend):
    def _is_administrator(self, user_obj):
        return (
            getattr(user_obj, "is_active", False)
            and getattr(user_obj, "role", None) == "ADMINISTRATOR"
        )

    def has_perm(self, user_obj, perm, obj=None):
        if self._is_administrator(user_obj):
            return True
        return super().has_perm(user_obj, perm, obj)

    def has_module_perms(self, user_obj, app_label):
        if self._is_administrator(user_obj):
            return True
        return super().has_module_perms(user_obj, app_label)
