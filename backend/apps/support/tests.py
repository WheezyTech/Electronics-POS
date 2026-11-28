from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User

from .models import SupportConversation, SupportMessage, SupportPresence


class SupportChatTests(TestCase):
    def setUp(self):
        self.requester = User.objects.create_user(
            username="requester",
            email="requester@example.test",
            password="Secure-requester-password-123!",
            role=User.Role.CASHIER,
        )
        self.manager = User.objects.create_user(
            username="manager",
            email="manager@example.test",
            password="Secure-manager-password-123!",
            role=User.Role.STORE_MANAGER,
        )
        self.other_user = User.objects.create_user(
            username="other",
            email="other@example.test",
            password="Secure-other-password-123!",
            role=User.Role.ACCOUNTANT,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.requester)

    def test_help_bot_guides_user_to_sales_and_offers_handoff(self):
        sales_response = self.client.post(
            "/api/support/help/",
            {"question": "Where can I see sales?"},
            format="json",
        )
        new_user_response = self.client.post(
            "/api/support/help/",
            {"question": "I am a new user, how do I get started?"},
            format="json",
        )
        handoff_response = self.client.post(
            "/api/support/help/",
            {"question": "I want to talk to an agent"},
            format="json",
        )

        self.assertEqual(sales_response.status_code, 200)
        self.assertEqual(sales_response.data["path"], "/sales")
        self.assertFalse(sales_response.data["handoff"])
        self.assertEqual(new_user_response.data["topic"], "Getting started")
        self.assertEqual(handoff_response.status_code, 200)
        self.assertTrue(handoff_response.data["handoff"])

    def test_recipients_are_filtered_by_selected_role_and_exclude_self(self):
        response = self.client.get(
            "/api/support/recipients/",
            {"role": "STORE_MANAGER"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([user["id"] for user in response.data], [self.manager.pk])
        self.assertFalse(response.data[0]["is_online"])

    @patch(
        "apps.support.views._send_resend_email",
        return_value={"id": "email-id"},
    )
    def test_creating_chat_with_offline_recipient_emails_sign_in_link(self, send_email):
        response = self.client.post(
            "/api/support/conversations/",
            {
                "recipient_role": "STORE_MANAGER",
                "recipient": self.manager.pk,
                "body": "Please help me find the daily sales report.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["notification_status"], "sent")
        send_email.assert_called_once()
        self.assertEqual(send_email.call_args.args[2], self.manager.email)
        self.assertIn("Sign in to respond", send_email.call_args.kwargs["html_message"])
        self.assertIn(
            response.data["conversation"]["id"],
            send_email.call_args.kwargs["html_message"],
        )
        self.assertEqual(SupportMessage.objects.count(), 1)

    @patch("apps.support.views._send_resend_email")
    def test_online_recipient_does_not_get_email(self, send_email):
        SupportPresence.objects.create(
            user=self.manager,
            last_seen_at=timezone.now(),
        )

        response = self.client.post(
            "/api/support/conversations/",
            {
                "recipient_role": "STORE_MANAGER",
                "recipient": self.manager.pk,
                "body": "Are you available?",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["notification_status"], "not_needed")
        send_email.assert_not_called()

    @patch(
        "apps.support.views._send_resend_email",
        side_effect=RuntimeError("Email provider unavailable."),
    )
    def test_email_failure_is_reported_without_losing_chat(self, send_email):
        response = self.client.post(
            "/api/support/conversations/",
            {
                "recipient_role": "STORE_MANAGER",
                "recipient": self.manager.pk,
                "body": "Please contact me.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["notification_status"], "failed")
        self.assertEqual(SupportMessage.objects.count(), 1)
        send_email.assert_called_once()

    def test_cannot_create_conversation_with_user_outside_selected_role(self):
        response = self.client.post(
            "/api/support/conversations/",
            {
                "recipient_role": "STORE_MANAGER",
                "recipient": self.other_user.pk,
                "body": "Please help.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(SupportConversation.objects.exists())

    def test_only_conversation_participants_can_read_messages(self):
        conversation = SupportConversation.objects.create(
            requester=self.requester,
            recipient=self.manager,
            recipient_role="STORE_MANAGER",
        )
        SupportMessage.objects.create(
            conversation=conversation,
            sender=self.requester,
            body="Private support request",
        )
        self.client.force_authenticate(self.other_user)

        response = self.client.get(
            f"/api/support/conversations/{conversation.pk}/messages/",
        )

        self.assertEqual(response.status_code, 404)

    def test_cashier_role_can_route_to_specialized_cashiers(self):
        specialist = User.objects.create_user(
            username="gas-cashier",
            email="gas-cashier@example.test",
            password="Secure-gas-cashier-password-123!",
            role=User.Role.GAS_LPG_CASHIER,
        )

        response = self.client.get(
            "/api/support/recipients/",
            {"role": "CASHIER"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            specialist.pk,
            [user["id"] for user in response.data],
        )
