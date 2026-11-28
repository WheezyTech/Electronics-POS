import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Check,
  Circle,
  Headphones,
  MessageCircle,
  Send,
  UserRound,
} from "lucide-react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

const recipientRoles = [
  { value: "SYSTEM_SUPPORT", label: "System support (admin)" },
  { value: "CASHIER", label: "Cashier" },
  { value: "STORE_MANAGER", label: "Store manager" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "ACCOUNTANT", label: "Accountant" },
];

const formatTime = (value) => value
  ? new Date(value).toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  : "";

export default function Support() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [linkedConversationId] = useState(
    () => searchParams.get("conversation") || "",
  );
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(linkedConversationId);
  const [messages, setMessages] = useState([]);
  const [botMessages, setBotMessages] = useState([
    {
      id: "welcome",
      sender: "bot",
      body: "Hi! I can guide you around Electronics POS. Ask where to find something, such as sales, stock, gas refills, or reports. Type “I want to talk to an agent” to contact a team member.",
    },
  ]);
  const [mode, setMode] = useState(linkedConversationId ? "chat" : "bot");
  const [role, setRole] = useState("");
  const [recipients, setRecipients] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId),
    [activeConversationId, conversations],
  );

  const loadConversations = useCallback(async () => {
    try {
      const response = await api.get("/support/conversations/");
      setConversations(response.data);
      setError("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail
        || "Unable to load support conversations.",
      );
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(loadConversations, 0);
    const interval = window.setInterval(loadConversations, 15_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConversationId || mode !== "chat") return undefined;

    let cancelled = false;
    const loadMessages = async () => {
      try {
        const response = await api.get(
          `/support/conversations/${activeConversationId}/messages/`,
        );
        if (!cancelled) {
          setMessages(response.data);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError.response?.data?.detail
            || "Unable to load this conversation.",
          );
        }
      }
    };

    loadMessages();
    const interval = window.setInterval(loadMessages, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeConversationId, mode]);

  const addBotMessage = (sender, body) => {
    setBotMessages((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random()}`, sender, body },
    ]);
  };

  const selectRole = async (roleValue) => {
    setRole(roleValue);
    setRecipients([]);
    setSelectedRecipient(null);
    setLoadingRecipients(true);
    setError("");
    try {
      const response = await api.get("/support/recipients/", {
        params: { role: roleValue },
      });
      setRecipients(response.data);
      setMode("select_user");
    } catch (requestError) {
      setError(
        requestError.response?.data?.role?.[0]
        || requestError.response?.data?.detail
        || "Unable to find support users.",
      );
    } finally {
      setLoadingRecipients(false);
    }
  };

  const selectConversation = (conversation) => {
    setActiveConversationId(conversation.id);
    setMode("chat");
    setMessages([]);
    setError("");
    setNotice("");
    setSearchParams({ conversation: conversation.id });
  };

  const startBot = () => {
    setMode("bot");
    setActiveConversationId("");
    setMessages([]);
    setSelectedRecipient(null);
    setSearchParams({});
    setError("");
    setNotice("");
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setError("");
    setNotice("");

    if (mode === "bot") {
      addBotMessage("user", body);
      try {
        const response = await api.post("/support/help/", { question: body });
        addBotMessage("bot", response.data.answer);
        if (response.data.handoff) setMode("select_role");
      } catch (requestError) {
        setError(
          requestError.response?.data?.question?.[0]
          || requestError.response?.data?.detail
          || "The help assistant could not answer right now.",
        );
      }
      return;
    }

    try {
      if (mode === "new_chat") {
        const response = await api.post("/support/conversations/", {
          recipient_role: role,
          recipient: selectedRecipient.id,
          body,
        });
        const conversation = response.data.conversation;
        setActiveConversationId(conversation.id);
        setMessages([response.data.message]);
        setMode("chat");
        setSearchParams({ conversation: conversation.id });
        setConversations((current) => [
          conversation,
          ...current.filter((item) => item.id !== conversation.id),
        ]);
        if (response.data.notification_status === "failed") {
          setNotice("Your message was sent, but the email notification could not be delivered.");
        } else if (response.data.notification_status === "sent") {
          setNotice("Your message was sent. An email was sent to notify them.");
        }
      } else if (mode === "chat" && activeConversationId) {
        const response = await api.post(
          `/support/conversations/${activeConversationId}/messages/`,
          { body },
        );
        setMessages((current) => [...current, response.data.message]);
        if (response.data.notification_status === "failed") {
          setNotice("Your message was sent, but the email notification could not be delivered.");
        } else if (response.data.notification_status === "sent") {
          setNotice("Your message was sent. An email was sent to notify them.");
        }
      }
      await loadConversations();
    } catch (requestError) {
      setDraft(body);
      setError(
        requestError.response?.data?.body?.[0]
        || requestError.response?.data?.detail
        || "Your message could not be sent.",
      );
    }
  };

  const transcript = mode === "bot" ? botMessages : messages;
  const otherUser = activeConversation?.other_user;
  const selectedRoleLabel = recipientRoles.find(
    (item) => item.value === role,
  )?.label;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="rounded-2xl bg-gradient-to-r from-blue-800 to-blue-600 p-6 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/15">
            <Headphones size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Help & Support</h1>
            <p className="mt-1 text-sm text-blue-100">
              Ask the system guide or chat privately with a team member.
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {notice}
        </div>
      )}

      <div className="grid min-h-[620px] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <button
              type="button"
              onClick={startBot}
              className="flex w-full items-center gap-3 rounded-xl bg-blue-50 p-3 text-left text-sm font-semibold text-blue-800 hover:bg-blue-100"
            >
              <Bot size={19} />
              Ask the system guide
            </button>
          </div>
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h2 className="text-sm font-bold text-slate-800">Your chats</h2>
            <button
              type="button"
              onClick={startBot}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              New help
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => selectConversation(conversation)}
                className={`mb-1 w-full rounded-xl p-3 text-left transition ${
                  activeConversationId === conversation.id
                    ? "bg-blue-50"
                    : "hover:bg-slate-50"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
                    <Circle
                      size={9}
                      className={conversation.other_user.is_online
                        ? "fill-emerald-500 text-emerald-500"
                        : "fill-slate-300 text-slate-300"}
                    />
                    <span className="truncate">{conversation.other_user.username}</span>
                  </span>
                  {conversation.unread_count > 0 && (
                    <span className="rounded-full bg-blue-700 px-2 py-0.5 text-[10px] font-bold text-white">
                      {conversation.unread_count}
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate pl-5 text-xs text-slate-500">
                  {conversation.last_message?.body || conversation.recipient_role_label}
                </span>
                <span className="mt-1 block pl-5 text-[10px] text-slate-400">
                  {formatTime(conversation.updated_at)}
                </span>
              </button>
            ))}
            {!conversations.length && (
              <p className="px-3 py-5 text-center text-xs text-slate-500">
                Your conversations will appear here.
              </p>
            )}
          </div>
          <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            Signed in as <span className="font-medium text-slate-700">{user?.username}</span>
          </div>
        </aside>

        <section className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex min-h-[68px] items-center gap-3 border-b border-slate-200 px-5 py-3">
            {mode !== "bot" && (
              <button
                type="button"
                onClick={startBot}
                aria-label="Back to system guide"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <ArrowLeft size={17} />
              </button>
            )}
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
              {mode === "bot" ? <Bot size={20} /> : <UserRound size={20} />}
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-bold text-slate-900">
                {mode === "bot" && "System help guide"}
                {mode === "select_role" && "Choose a support team"}
                {mode === "select_user" && `Choose ${selectedRoleLabel}`}
                {mode === "new_chat" && selectedRecipient?.username}
                {mode === "chat" && (otherUser?.username || "Support conversation")}
              </h2>
              <p className="text-xs text-slate-500">
                {mode === "bot" && "Automated help for using Electronics POS"}
                {mode === "select_role" && "Select who you would like to contact"}
                {mode === "select_user" && "Choose a person to start a private chat"}
                {mode === "new_chat" && (selectedRecipient?.is_online ? "Online" : "Offline — email notification will be sent")}
                {mode === "chat" && (
                  <span className="inline-flex items-center gap-1">
                    {otherUser?.is_online
                      ? <><Circle size={8} className="fill-emerald-500 text-emerald-500" /> Online</>
                      : <><Circle size={8} className="fill-slate-300 text-slate-300" /> Offline</>}
                    <span className="ml-1">· {activeConversation?.recipient_role_label}</span>
                  </span>
                )}
              </p>
            </div>
          </div>

          {mode === "select_role" ? (
            <div className="flex-1 overflow-y-auto p-5">
              <p className="mb-4 text-sm text-slate-600">
                Which team would you like to talk to?
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {recipientRoles.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    disabled={loadingRecipients}
                    onClick={() => selectRole(item.value)}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-4 text-left text-sm font-semibold text-slate-800 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60"
                  >
                    {item.label}
                    <ArrowLeft className="rotate-180 text-slate-400" size={16} />
                  </button>
                ))}
              </div>
            </div>
          ) : mode === "select_user" ? (
            <div className="flex-1 overflow-y-auto p-5">
              <button
                type="button"
                onClick={() => setMode("select_role")}
                className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-blue-700"
              >
                <ArrowLeft size={15} /> Choose a different team
              </button>
              <div className="space-y-2">
                {recipients.map((recipient) => (
                  <button
                    type="button"
                    key={recipient.id}
                    onClick={() => {
                      setSelectedRecipient(recipient);
                      setMessages([]);
                      setMode("new_chat");
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50"
                  >
                    <span className="flex items-center gap-3">
                      <UserRound className="text-slate-500" size={19} />
                      <span>
                        <span className="block text-sm font-semibold text-slate-800">{recipient.username}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{recipient.role.replaceAll("_", " ")}</span>
                      </span>
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs ${recipient.is_online ? "text-emerald-700" : "text-slate-500"}`}>
                      <Circle size={8} className={recipient.is_online ? "fill-emerald-500 text-emerald-500" : "fill-slate-300 text-slate-300"} />
                      {recipient.is_online ? "Online" : "Offline"}
                    </span>
                  </button>
                ))}
                {!recipients.length && !loadingRecipients && (
                  <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                    There are no active users in this team available to contact right now.
                  </div>
                )}
                {loadingRecipients && (
                  <p className="py-5 text-center text-sm text-slate-500">Loading available users…</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-4 sm:p-6">
                {transcript.map((message) => {
                  const isOwnMessage = mode === "bot"
                    ? message.sender === "user"
                    : message.sender === user?.id;
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                    >
                      <article className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[75%] ${
                        isOwnMessage
                          ? "rounded-br-md bg-blue-700 text-white"
                          : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                      }`}>
                        <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                        <p className={`mt-1 text-[10px] ${isOwnMessage ? "text-blue-100" : "text-slate-400"}`}>
                          {mode === "bot" && !isOwnMessage
                            ? "System guide"
                            : mode === "chat" && !isOwnMessage
                              ? message.sender_name
                              : formatTime(message.created_at)}
                          {mode === "chat" && isOwnMessage && (
                            <Check className="ml-1 inline" size={12} />
                          )}
                        </p>
                      </article>
                    </div>
                  );
                })}
                {mode === "new_chat" && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                    Send a message to {selectedRecipient?.username} to start your private chat.
                    {selectedRecipient && !selectedRecipient.is_online && (
                      <span className="mt-1 block text-xs text-blue-700">
                        They are offline. We’ll email them a sign-in link when you send your message.
                      </span>
                    )}
                  </div>
                )}
                {mode === "chat" && !messages.length && (
                  <p className="py-8 text-center text-sm text-slate-500">Loading conversation…</p>
                )}
              </div>
              <form onSubmit={sendMessage} className="flex items-end gap-3 border-t border-slate-200 bg-white p-4">
                <label className="sr-only" htmlFor="support-message">Message</label>
                <textarea
                  id="support-message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form.requestSubmit();
                    }
                  }}
                  maxLength={mode === "bot" ? 1000 : 4000}
                  rows={2}
                  placeholder={mode === "bot" ? "Ask how to use the system…" : "Write your message…"}
                  className="min-h-12 flex-1 resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  disabled={mode === "chat" && activeConversation?.is_closed}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || (mode === "chat" && activeConversation?.is_closed)}
                  className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send size={16} />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </>
          )}
        </section>
      </div>
      <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-500">
        <MessageCircle size={14} /> Human chats are private between you and the selected team member.
      </p>
    </div>
  );
}
