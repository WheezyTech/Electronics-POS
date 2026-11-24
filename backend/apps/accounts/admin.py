
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils import timezone

from .models import (
    AccountVerificationAudit,
    Device,
    OfflineAuthorization,
    User,
)


@admin.register(AccountVerificationAudit)
class AccountVerificationAuditAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "action",
        "details",
        "performed_by",
        "ip_address",
        "created_at",
    )
    list_filter = ("action", "created_at")
    search_fields = ("user__username", "user__email", "details")
    readonly_fields = (
        "user",
        "action",
        "details",
        "performed_by",
        "ip_address",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


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
        'email_verified',
        'phone_verified',
        'is_active',
        'is_staff',
    )

    list_filter = (
        'role',
        'email_verified',
        'phone_verified',
        'is_active',
        'is_staff',
    )

    readonly_fields = UserAdmin.readonly_fields + (
        'email_verified',
        'email_verification_otp',
        'email_verification_otp_expires_at',
        'phone_verified',
    )
    actions = ('mark_email_verified', 'mark_phone_verified')

    fieldsets = UserAdmin.fieldsets + (
        ('POS Account Information', {
            'fields': (
                'role',
                'phone_number',
            ),
        }),
        ('Email Verification', {
            'fields': (
                'email_verified',
                'email_verification_otp',
                'email_verification_otp_expires_at',
            ),
        }),
        ('Phone Verification', {
            'fields': ('phone_verified',),
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

    @admin.action(description='Mark selected users email as verified')
    def mark_email_verified(self, request, queryset):
        updated = queryset.update(
            email_verified=True,
            email_verification_otp="",
            email_verification_otp_expires_at=None,
        )
        self.message_user(
            request,
            f'{updated} user(s) marked as email verified.',
        )

    @admin.action(description='Mark selected users phone as verified')
    def mark_phone_verified(self, request, queryset):
        updated = 0
        for selected_user in queryset:
            if not selected_user.phone_number:
                continue
            selected_user.phone_verified = True
            selected_user.phone_verification_otp_hash = ""
            selected_user.phone_verification_otp_expires_at = None
            selected_user.phone_verification_attempts = 0
            selected_user.save(update_fields=[
                "phone_verified",
                "phone_verification_otp_hash",
                "phone_verification_otp_expires_at",
                "phone_verification_attempts",
            ])
            AccountVerificationAudit.objects.create(
                user=selected_user,
                action=AccountVerificationAudit.Action.PHONE_MANUAL_APPROVED,
                details="Manual phone approval by Django administrator.",
                performed_by=request.user,
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            updated += 1
        self.message_user(
            request,
            f'{updated} user(s) marked as phone verified.',
        )
