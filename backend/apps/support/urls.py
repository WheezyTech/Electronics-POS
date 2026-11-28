from django.urls import path

from .views import (
    SupportConversationListCreateView,
    SupportConversationMessagesView,
    SupportHelpView,
    SupportPresenceView,
    SupportRecipientsView,
)

urlpatterns = [
    path("presence/", SupportPresenceView.as_view(), name="support-presence"),
    path("recipients/", SupportRecipientsView.as_view(), name="support-recipients"),
    path("help/", SupportHelpView.as_view(), name="support-help"),
    path(
        "conversations/",
        SupportConversationListCreateView.as_view(),
        name="support-conversations",
    ),
    path(
        "conversations/<uuid:conversation_id>/messages/",
        SupportConversationMessagesView.as_view(),
        name="support-messages",
    ),
]
