import logging
import re
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.html import format_html
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.email_tokens import _send_resend_email

from .models import SupportConversation, SupportMessage, SupportPresence
from .serializers import SupportMessageInputSerializer, SupportMessageSerializer

logger = logging.getLogger(__name__)

RECIPIENT_ROLES = {
    "SYSTEM_SUPPORT": ("System support", [User.Role.ADMINISTRATOR]),
    "CASHIER": (
        "Cashier",
        [
            User.Role.CASHIER,
            User.Role.ELECTRONICS_CASHIER,
            User.Role.GAS_LPG_CASHIER,
        ],
    ),
    "STORE_MANAGER": ("Store manager", [User.Role.STORE_MANAGER]),
    "SUPERVISOR": ("Supervisor", [User.Role.SUPERVISOR]),
    "ACCOUNTANT": ("Accountant", [User.Role.ACCOUNTANT]),
}
PRESENCE_TIMEOUT = timedelta(minutes=2)


def _is_online(user, now=None):
    now = now or timezone.now()
    presence = getattr(user, "support_presence", None)
    return bool(presence and presence.last_seen_at >= now - PRESENCE_TIMEOUT)


def _conversation_data(conversation, user):
    other_user = (
        conversation.recipient
        if conversation.requester_id == user.pk
        else conversation.requester
    )
    latest_message = conversation.messages.order_by("-created_at").first()
    unread_count = conversation.messages.filter(
        read_at__isnull=True,
    ).exclude(sender=user).count()
    return {
        "id": str(conversation.pk),
        "other_user": {
            "id": other_user.pk,
            "username": other_user.username,
            "role": other_user.role,
            "is_online": _is_online(other_user),
        },
        "recipient_role": conversation.recipient_role,
        "recipient_role_label": RECIPIENT_ROLES[conversation.recipient_role][0],
        "is_closed": conversation.is_closed,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "last_message": (
            SupportMessageSerializer(latest_message).data if latest_message else None
        ),
        "unread_count": unread_count,
    }


def _get_conversation(conversation_id, user):
    conversation = SupportConversation.objects.select_related(
        "requester", "recipient"
    ).filter(
        Q(requester=user) | Q(recipient=user),
        pk=conversation_id,
    ).first()
    if not conversation:
        raise NotFound("Support conversation not found.")
    return conversation


def _send_offline_notification(conversation, message):
    sender = message.sender
    recipient = (
        conversation.requester
        if conversation.recipient_id == sender.pk
        else conversation.recipient
    )
    response_url = (
        f"{settings.FRONTEND_URL}/support?conversation={conversation.pk}"
    )
    subject = f"Support chat message from {sender.username}"
    text_body = (
        f"{sender.username} sent you a message in Electronics POS support.\n\n"
        f"{message.body}\n\n"
        f"Sign in to respond: {response_url}"
    )
    html_body = format_html(
        "<p><strong>{}</strong> sent you a message in Electronics POS support.</p>"
        "<blockquote>{}</blockquote>"
        '<p><a href="{}">Sign in to respond</a></p>',
        sender.username,
        message.body,
        response_url,
    )
    try:
        result = _send_resend_email(
            subject,
            text_body,
            recipient.email,
            html_message=html_body,
        )
        return bool(result)
    except (ImproperlyConfigured, RuntimeError):
        logger.exception(
            "Unable to send offline support notification for conversation %s.",
            conversation.pk,
        )
        return False


class SupportPresenceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        SupportPresence.objects.update_or_create(
            user=request.user,
            defaults={"last_seen_at": timezone.now()},
        )
        return Response({"online": True})


class SupportRecipientsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role_key = request.query_params.get("role", "").upper()
        role_data = RECIPIENT_ROLES.get(role_key)
        if not role_data:
            raise ValidationError({"role": "Choose a valid support role."})

        now = timezone.now()
        users = User.objects.filter(
            role__in=role_data[1],
            is_active=True,
        ).exclude(pk=request.user.pk).order_by("username")
        presences = {
            presence.user_id: presence.last_seen_at
            for presence in SupportPresence.objects.filter(
                user__in=users,
                last_seen_at__gte=now - PRESENCE_TIMEOUT,
            )
        }
        return Response([
            {
                "id": user.pk,
                "username": user.username,
                "role": user.role,
                "is_online": user.pk in presences,
            }
            for user in users
        ])


class SupportConversationListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        conversations = SupportConversation.objects.filter(
            Q(requester=request.user) | Q(recipient=request.user)
        ).select_related(
            "requester", "recipient"
        ).prefetch_related("messages__sender")
        return Response([
            _conversation_data(conversation, request.user)
            for conversation in conversations
        ])

    @transaction.atomic
    def post(self, request):
        role_key = str(request.data.get("recipient_role", "")).upper()
        role_data = RECIPIENT_ROLES.get(role_key)
        if not role_data:
            raise ValidationError({"recipient_role": "Choose a valid support role."})
        try:
            recipient_id = int(request.data.get("recipient"))
        except (TypeError, ValueError):
            raise ValidationError({"recipient": "Choose a support user."})

        recipient = User.objects.filter(
            pk=recipient_id,
            role__in=role_data[1],
            is_active=True,
        ).first()
        if not recipient or recipient.pk == request.user.pk:
            raise ValidationError({"recipient": "Choose an active user in that role."})
        message_serializer = SupportMessageInputSerializer(data=request.data)
        message_serializer.is_valid(raise_exception=True)

        conversation = SupportConversation.objects.create(
            requester=request.user,
            recipient=recipient,
            recipient_role=role_key,
        )
        message = SupportMessage.objects.create(
            conversation=conversation,
            sender=request.user,
            body=message_serializer.validated_data["body"],
        )
        notification_status = "not_needed"
        if not _is_online(recipient):
            notification_status = (
                "sent" if _send_offline_notification(conversation, message)
                else "failed"
            )
        return Response(
            {
                "conversation": _conversation_data(conversation, request.user),
                "message": SupportMessageSerializer(message).data,
                "notification_status": notification_status,
            },
            status=status.HTTP_201_CREATED,
        )


class SupportConversationMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = _get_conversation(conversation_id, request.user)
        now = timezone.now()
        conversation.messages.exclude(sender=request.user).filter(
            read_at__isnull=True,
        ).update(read_at=now)
        messages = conversation.messages.select_related("sender").all()
        return Response(SupportMessageSerializer(messages, many=True).data)

    @transaction.atomic
    def post(self, request, conversation_id):
        conversation = _get_conversation(conversation_id, request.user)
        if conversation.is_closed:
            raise ValidationError("This support conversation is closed.")
        serializer = SupportMessageInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = SupportMessage.objects.create(
            conversation=conversation,
            sender=request.user,
            body=serializer.validated_data["body"],
        )
        conversation.save(update_fields=["updated_at"])
        recipient = (
            conversation.requester
            if conversation.recipient_id == request.user.pk
            else conversation.recipient
        )
        notification_status = "not_needed"
        if not _is_online(recipient):
            notification_status = (
                "sent" if _send_offline_notification(conversation, message)
                else "failed"
            )
        return Response(
            {
                "message": SupportMessageSerializer(message).data,
                "notification_status": notification_status,
            },
            status=status.HTTP_201_CREATED,
        )


class SupportHelpView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        question = str(request.data.get("question", "")).strip()
        if not question or len(question) > 1000:
            raise ValidationError({
                "question": "Enter a question of 1 to 1000 characters."
            })

        normalized = re.sub(r"\s+", " ", question.lower())
        if any(phrase in normalized for phrase in (
            "talk to agent",
            "talk to an agent",
            "talk to a human",
            "talk to a person",
            "talk to someone",
            "talk to support",
            "speak to agent",
            "speak to an agent",
            "speak to a human",
            "speak to someone",
            "human support",
        )):
            return Response({
                "answer": (
                    "I can connect you with a team member. Choose the role you "
                    "need, then select an available user to start a private chat."
                ),
                "handoff": True,
            })

        topics = [
            (
                ("new to the system", "new user", "get started", "first time", "where do i begin"),
                "Getting started",
                "Start from your home page and use the left menu to open each section. "
                "Your role controls which pages and actions are available. For your "
                "first sale, open Point of Sale; for a tour of a section, ask me "
                "about Sales, Inventory, Gas & LPG, Purchasing, or Reports.",
                "/",
            ),
            (
                ("sale", "sales", "receipt", "transaction", "pos"),
                "Sales",
                "Open Sales in the left menu to review transaction history. "
                "Use the filters to find sales by date, cashier, location, or "
                "payment method. Open Point of Sale to record a new sale.",
                "/sales",
            ),
            (
                ("gas", "lpg", "cylinder", "refill"),
                "Gas & LPG",
                "Open Gas & LPG in the left menu. The Overview shows cylinder "
                "stock; use Gas refill, Empty exchange, or New cylinder sale "
                "to record transactions, and Sales history to review them.",
                "/gas",
            ),
            (
                ("inventory", "stock", "quantity"),
                "Inventory",
                "Open Inventory in the left menu to review product stock. "
                "Administrators and store managers can manage stock and "
                "record adjustments.",
                "/inventory",
            ),
            (
                ("purchase", "supplier", "receive"),
                "Purchasing",
                "Open Purchasing in the left menu to record supplier purchases "
                "and receive stock. For gas cylinders, use Gas & LPG → Gas purchase.",
                "/purchasing",
            ),
            (
                ("report", "revenue", "profit", "account"),
                "Reports",
                "Open Reports in the left menu to view business reports. "
                "Available reports depend on your account role.",
                "/reports",
            ),
            (
                ("return", "refund", "exchange"),
                "Returns",
                "Open Returns in the left menu to find a sale and record an "
                "eligible return or refund.",
                "/returns",
            ),
            (
                ("product", "barcode", "catalog"),
                "Products",
                "Open Products to manage the product catalogue. Use Barcodes "
                "to search, print, or manage product barcodes.",
                "/products",
            ),
            (
                ("staff", "user", "employee", "account"),
                "Staff and accounts",
                "Administrators can open Settings to manage user accounts and "
                "system configuration. Store managers can use Store Setup for "
                "store-level options.",
                "/settings",
            ),
        ]
        for keywords, title, answer, path in topics:
            if any(keyword in normalized for keyword in keywords):
                return Response({
                    "answer": answer,
                    "topic": title,
                    "path": path,
                    "handoff": False,
                })
        return Response({
            "answer": (
                "I can help with Sales, Point of Sale, Inventory, Purchasing, "
                "Gas & LPG, Returns, Products, and Reports. Ask about one of "
                "these areas, or type “I want to talk to an agent” to contact "
                "a team member."
            ),
            "handoff": False,
        })
