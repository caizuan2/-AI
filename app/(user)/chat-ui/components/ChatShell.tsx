"use client";

import * as React from "react";
import { Menu, Plus } from "lucide-react";
import {
  askChat,
  fetchConversationHistory,
  fetchConversations,
  fetchCurrentChatUser,
  fetchQuickActionCategories
} from "../api";
import {
  appendAskResult,
  createNewChatState,
  createUserMessage,
  normalizeChatMode
} from "../chat-ui-state";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";
import { ChatQuickActions } from "./ChatQuickActions";
import { ChatSidebarDrawer } from "./ChatSidebarDrawer";
import type {
  ChatConversation,
  ChatMessageView,
  ChatMode,
  ChatQuickActionItem,
  CurrentChatUser
} from "../types";

export function ChatShell() {
  const [mode, setMode] = React.useState<ChatMode>("fast");
  const [enableDeepThinking, setEnableDeepThinking] = React.useState(false);
  const [enableWebSearch, setEnableWebSearch] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [conversations, setConversations] = React.useState<ChatConversation[]>([]);
  const [messages, setMessages] = React.useState<ChatMessageView[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [conversationLoading, setConversationLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [quickActions, setQuickActions] = React.useState<ChatQuickActionItem[]>([]);
  const [currentUser, setCurrentUser] = React.useState<CurrentChatUser | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const loadConversations = React.useCallback(async () => {
    setConversationLoading(true);

    try {
      const result = await fetchConversations();

      setConversations(result.conversations);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "会话列表加载失败。");
    } finally {
      setConversationLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  React.useEffect(() => {
    let mounted = true;

    async function loadQuickActions() {
      const categories = await fetchQuickActionCategories();

      if (mounted) {
        setQuickActions(categories);
      }
    }

    void loadQuickActions();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    let mounted = true;

    async function loadCurrentUser() {
      try {
        const result = await fetchCurrentChatUser();

        if (mounted) {
          setCurrentUser(result.user);
        }
      } catch {
        if (mounted) {
          setCurrentUser(null);
        }
      }
    }

    void loadCurrentUser();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, loading]);

  async function handleSelectConversation(nextConversationId: string) {
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const history = await fetchConversationHistory(nextConversationId);

      setConversationId(history.conversation.id);
      setMode(normalizeChatMode(history.conversation.mode));
      setMessages(history.messages);
      setSidebarOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "会话历史加载失败。");
    } finally {
      setLoading(false);
    }
  }

  function handleNewChat() {
    const nextState = createNewChatState();

    setConversationId(nextState.conversationId);
    setMessages(nextState.messages);
    setInput(nextState.input);
    setError(nextState.error);
    setNotice(null);
    setSidebarOpen(false);
  }

  function showNotice(message: string) {
    setNotice(message);
    setError(null);
  }

  function handleQuickAction(action: ChatQuickActionItem) {
    if (action.kind === "mode" && action.mode) {
      setMode(action.mode);
      showNotice(`${action.label}模式已切换。`);
      return;
    }

    const nextInput = action.prompt?.trim() || action.label;

    if (nextInput) {
      setInput(nextInput);
      showNotice(`已选择「${action.label}」，可以继续补充问题后发送。`);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST"
      });
    } finally {
      window.location.href = "/login?app=user&next=/chat-ui";
    }
  }

  function handleScan() {
    showNotice("扫描内容入口已保留，后续接入图片识别后可在这里继续使用。");
  }

  function handleMessages() {
    showNotice("消息入口已保留，当前可通过左侧历史会话查看已有对话。");
  }

  function handleChangePassword() {
    showNotice("修改密码入口已保留，请在账号安全功能接入后使用。");
  }

  function handleSwitchAccount() {
    showNotice("切换账号会返回登录页。");
    window.location.href = "/login?app=user&next=/chat-ui";
  }

  async function handleSubmit() {
    const text = input.trim();

    if (!text || loading) {
      return;
    }

    const localUserMessage = createUserMessage(text);

    setInput("");
    setError(null);
    setNotice(null);
    setLoading(true);
    setMessages((current) => [...current, localUserMessage]);

    try {
      const result = await askChat({
        text,
        attachments: [],
        conversation_id: conversationId,
        mode,
        enable_deep_thinking: enableDeepThinking,
        enable_web_search: enableWebSearch
      });

      setConversationId(result.conversation_id);
      setMode(normalizeChatMode(result.mode));
      setMessages((current) => appendAskResult(current, localUserMessage.id, result));
      void loadConversations();
    } catch (requestError) {
      setMessages((current) => current.filter((message) => message.id !== localUserMessage.id));
      setError(requestError instanceof Error ? requestError.message : "发送失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex h-screen w-full max-w-[430px] overflow-hidden bg-white shadow-2xl shadow-slate-300/40">
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <ChatSidebarDrawer
            conversations={conversations}
            activeConversationId={conversationId}
            open={sidebarOpen}
            loading={conversationLoading}
            userName={currentUser?.name || currentUser?.phone || "当前用户"}
            userDescription={currentUser?.phone ? `账号 ${currentUser.phone}` : "AI 知识库账号"}
            onClose={() => setSidebarOpen(false)}
            onNewChat={handleNewChat}
            onSelect={handleSelectConversation}
            onScan={handleScan}
            onMessages={handleMessages}
            onLogout={handleLogout}
            onChangePassword={handleChangePassword}
            onSwitchAccount={handleSwitchAccount}
          />

          <header className="z-20 shrink-0 bg-white px-5 pt-2">
            <span className="sr-only">AI 知识库助手</span>
            <div className="flex h-8 items-center justify-between px-2 text-[15px] font-bold text-slate-950">
              <span>11:54</span>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="flex items-end gap-0.5">
                  <span className="h-2 w-1 rounded-sm bg-slate-950" />
                  <span className="h-3 w-1 rounded-sm bg-slate-950" />
                  <span className="h-4 w-1 rounded-sm bg-slate-950" />
                </span>
                <span className="text-base leading-none">⌁</span>
                <span className="h-4 w-7 rounded-md border-2 border-slate-950">
                  <span className="ml-0.5 mt-0.5 block h-2.5 w-4 rounded-sm bg-slate-950" />
                </span>
              </div>
            </div>

            <div className="grid h-16 grid-cols-[52px_1fr_52px] items-center">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="focus-ring inline-flex h-12 w-12 items-center justify-center rounded-full text-slate-950 hover:bg-slate-100"
                aria-label="打开历史会话"
              >
                <Menu className="h-8 w-8" strokeWidth={2.4} aria-hidden="true" />
              </button>

              <div className="min-w-0 text-center">
                <h1 className="truncate text-lg font-bold text-slate-950">新对话</h1>
                <p className="mt-0.5 truncate text-xs font-medium text-slate-400">内容由 AI 生成</p>
              </div>

              <button
                type="button"
                onClick={handleNewChat}
                className="focus-ring ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-950 hover:bg-slate-100"
                aria-label="新建对话"
              >
                <Plus className="h-7 w-7" strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          </header>

          {error ? (
            <div className="mx-4 mt-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mx-4 mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {notice}
            </div>
          ) : null}

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-white">
            <ChatMessages
              messages={messages}
              loading={loading}
              mode={mode}
              onModeChange={setMode}
            />
          </div>

          <ChatQuickActions
            mode={mode}
            enableDeepThinking={enableDeepThinking}
            enableWebSearch={enableWebSearch}
            quickActions={quickActions}
            onModeChange={setMode}
            onToggleDeepThinking={() => setEnableDeepThinking((enabled) => !enabled)}
            onToggleWebSearch={() => setEnableWebSearch((enabled) => !enabled)}
            onQuickAction={handleQuickAction}
          />

          <ChatInput
            value={input}
            loading={loading}
            onValueChange={setInput}
            onSubmit={handleSubmit}
            onStatusMessage={showNotice}
          />
        </main>
      </div>
    </div>
  );
}
