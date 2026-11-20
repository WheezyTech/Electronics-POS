
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils import timezone

from .models import Device, OfflineAuthorization, User


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'sync_id',
        'platform',
        'registered_by',
        'is_active',
        'created_at',
        'deactivated_at',
    )
    list_filter = ('platform', 'is_active')
    search_fields = ('name', 'sync_id', 'registered_by__username')
    readonly_fields = ('sync_id', 'created_at', 'last_seen_at')


@admin.register(OfflineAuthorization)
class OfflineAuthorizationAdmin(admin.ModelAdmin):
    list_display = (
        'user',
        'device',
        'operation',
        'authorized_by',
        'granted_at',
        'expires_at',
        'revoked_at',
    )
    list_filter = ('operation', 'granted_at', 'expires_at', 'revoked_at')
    search_fields = ('user__username', 'device__name', 'device__sync_id')
    readonly_fields = (
        'user',
        'device',
        'operation',
        'authorized_by',
        'granted_at',
        'expires_at',
        'revoked_at',
        'revoked_by',
    )
    actions = ('revoke_selected',)

    @admin.action(description='Revoke selected offline authorizations')
    def revoke_selected(self, request, queryset):
        revoked = queryset.filter(revoked_at__isnull=True).update(
            revoked_at=timezone.now(),
            revoked_by=request.user,
        )
        self.message_user(
            request,
            f'{revoked} offline authorization(s) revoked.',
        )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(User)
class CustomUserAdmin(UserAdmin):

    list_display = (
        'username',
        'email',
        'first_name',
        'last_name',
        'role',
        'is_active',
        'is_staff',
    )

    list_filter = (
        'role',
        'is_active',
        'is_staff',
    )

    fieldsets = UserAdmin.fieldsets + (
        ('POS Account Information', {
            'fields': (
                'role',
                'phone_number',
            ),
        }),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        ('POS Account Information', {
            'fields': (
                'email',
                'role',
                'phone_number',
            ),
        }),
    )
