"use client";

import * as React from "react";
import { Menu, Plus } from "lucide-react";
import { CapacitorOtaUpdater } from "@/components/ota/CapacitorOtaUpdater";
import {
  askChat,
  changeCurrentUserPassword,
  fetchConversationHistory,
  fetchConversations,
  fetchCurrentChatUser,
  fetchQuickActionCategories,
  logoutCurrentChatUser,
  uploadChatAttachments,
  USER_CHAT_LOGIN_URL
} from "../api";
import {
  appendAskResult,
  createNewChatState,
  createUserMessage,
  getChatUserAvatarStorageKey,
  getCurrentChatUserAvatarUrl,
  getCurrentChatUserDisplayAccount,
  getCurrentChatUserDisplayName,
  normalizeChatMode
} from "../chat-ui-state";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";
import { ChatQuickActions } from "./ChatQuickActions";
import { ChatSidebarDrawer } from "./ChatSidebarDrawer";
import type {
  ChatConversation,
  ChatAttachmentDraft,
  ChatMessageView,
  ChatMode,
  ChangePasswordInput,
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
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [conversationLoading, setConversationLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [quickActions, setQuickActions] = React.useState<ChatQuickActionItem[]>([]);
  const [currentUser, setCurrentUser] = React.useState<CurrentChatUser | null>(null);
  const [currentAvatarUrl, setCurrentAvatarUrl] = React.useState<string | null>(null);
  const [openAttachmentSignal, setOpenAttachmentSignal] = React.useState(0);
  const [openCameraSignal, setOpenCameraSignal] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const historyRequestIdRef = React.useRef(0);
  const currentUserName = getCurrentChatUserDisplayName(currentUser);
  const currentUserAccount = getCurrentChatUserDisplayAccount(currentUser);

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
    if (!currentUser) {
      setCurrentAvatarUrl(null);
      return;
    }

    const remoteAvatarUrl = getCurrentChatUserAvatarUrl(currentUser);

    if (remoteAvatarUrl) {
      setCurrentAvatarUrl(remoteAvatarUrl);
      return;
    }

    try {
      setCurrentAvatarUrl(window.localStorage.getItem(getChatUserAvatarStorageKey(currentUser)));
    } catch {
      setCurrentAvatarUrl(null);
    }
  }, [currentUser]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, loading]);

  async function handleSelectConversation(nextConversationId: string) {
    const requestId = historyRequestIdRef.current + 1;

    historyRequestIdRef.current = requestId;
    setError(null);
    setNotice(null);
    setHistoryLoading(true);
    setConversationId(nextConversationId);
    setMessages([]);
    setSidebarOpen(false);

    try {
      const history = await fetchConversationHistory(nextConversationId);

      if (historyRequestIdRef.current !== requestId) {
        return;
      }

      setConversationId(history.conversation.id || nextConversationId);
      setMode(normalizeChatMode(history.conversation.mode));
      setMessages(Array.isArray(history.messages) ? history.messages : []);
    } catch {
      if (historyRequestIdRef.current !== requestId) {
        return;
      }

      setError("历史记录加载失败，请稍后重试");
      setMessages([]);
    } finally {
      if (historyRequestIdRef.current === requestId) {
        setHistoryLoading(false);
      }
    }
  }

  function handleNewChat() {
    const nextState = createNewChatState();

    historyRequestIdRef.current += 1;
    setHistoryLoading(false);
    setConversationId(nextState.conversationId);
    setMessages(nextState.messages);
    setInput(nextState.input);
    setError(nextState.error);
    setNotice(null);
    setSidebarOpen(false);
  }

  function showNotice(message: string) {
    setNotice(message);
  }

  function handleQuickAction(action: ChatQuickActionItem) {
    if (action.kind === "mode" && action.mode) {
      setMode(action.mode);
      showNotice(`${action.label}模式已切换。`);
      return;
    }

    const nextInput = action.prompt?.trim() || action.label;

    if (action.action === "open_upload") {
      setOpenAttachmentSignal((value) => value + 1);
      showNotice(`已打开「${action.label}」上传入口。`);
      return;
    }

    if (action.action === "open_camera") {
      setOpenCameraSignal((value) => value + 1);
      showNotice(`已打开「${action.label}」相机入口。`);
      return;
    }

    if (action.action === "send_prompt") {
      if (nextInput) {
        void submitText(nextInput);
        return;
      }

      showNotice("该功能缺少可发送的提示词。");
      return;
    }

    if (!action.action || action.action === "fill_prompt") {
      setInput(nextInput);
      showNotice(`已选择「${action.label}」，可以继续补充问题后发送。`);
      return;
    }

    showNotice("该功能待接入。");
  }

  async function handleLogout() {
    try {
      await logoutCurrentChatUser();
    } finally {
      window.location.href = USER_CHAT_LOGIN_URL;
    }
  }

  function handleScan() {
    showNotice("已打开扫描入口。移动端可调用相机，桌面端可选择图片，二维码识别能力后续接入。");
  }

  function handleScanFileSelected(file: File) {
    showNotice(`已选择扫描图片：${file.name}。当前先保留图片入口，后续可接入二维码识别。`);
  }

  function handleMessages() {
    showNotice("已打开通知面板。");
  }

  async function handleChangePassword(input: ChangePasswordInput) {
    await changeCurrentUserPassword(input);
    showNotice("密码已修改。");
  }

  async function handleSwitchAccount() {
    await handleLogout();
  }

  function handleAvatarSaved(nextAvatarUrl: string | null) {
    setCurrentAvatarUrl(nextAvatarUrl);
    setCurrentUser((user) => (
      user
        ? {
            ...user,
            avatar_url: nextAvatarUrl,
            avatar: nextAvatarUrl
          }
        : user
    ));
  }

  async function submitText(text: string, attachments: ChatAttachmentDraft[] = []) {
    if (!text || loading) {
      if (!text && attachments.length > 0) {
        showNotice("请先输入问题，再随问题一起发送附件。");
      }

      return false;
    }

    setError(null);
    setNotice(null);
    setLoading(true);
    let localUserMessage: ChatMessageView | null = null;

    try {
      const uploadedAttachments = await uploadChatAttachments(attachments).catch(() => {
        throw new Error("图片上传失败，请重新选择后再发送。");
      });

      const nextUserMessage = createUserMessage(text, uploadedAttachments);

      localUserMessage = nextUserMessage;
      setInput("");
      setMessages((current) => [...current, nextUserMessage]);

      const result = await askChat({
        text,
        attachments: uploadedAttachments,
        conversation_id: conversationId,
        mode,
        enable_deep_thinking: enableDeepThinking,
        enable_web_search: enableWebSearch
      });

      setConversationId(result.conversation_id);
      setMode(normalizeChatMode(result.mode));
      setMessages((current) => appendAskResult(current, nextUserMessage.id, result));
      void loadConversations();
      return true;
    } catch (requestError) {
      if (localUserMessage) {
        const failedMessageId = localUserMessage.id;

        setMessages((current) => current.filter((message) => message.id !== failedMessageId));
      }

      setError(requestError instanceof Error ? requestError.message : "发送失败，请稍后重试。");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(attachments: ChatAttachmentDraft[] = []) {
    return submitText(input.trim(), attachments);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <CapacitorOtaUpdater />
      <div className="mx-auto flex h-screen w-full max-w-[430px] overflow-hidden bg-white shadow-2xl shadow-slate-300/40">
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <ChatSidebarDrawer
            conversations={conversations}
            activeConversationId={conversationId}
            open={sidebarOpen}
            loading={conversationLoading}
            currentUser={currentUser}
            userName={currentUserName}
            userDescription={currentUserAccount}
            avatarUrl={currentAvatarUrl}
            onClose={() => setSidebarOpen(false)}
            onNewChat={handleNewChat}
            onSelect={handleSelectConversation}
            onScan={handleScan}
            onScanFileSelected={handleScanFileSelected}
            onMessages={handleMessages}
            onLogout={handleLogout}
            onAvatarSaved={handleAvatarSaved}
            onChangePassword={handleChangePassword}
            onSwitchAccount={handleSwitchAccount}
          />

          <header className="z-20 shrink-0 bg-white px-5">
            <span className="sr-only">AI 知识库助手</span>
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
            {historyLoading ? (
              <div className="flex min-h-[360px] flex-1 items-center justify-center px-8 text-center text-sm font-semibold text-slate-500">
                正在加载历史记录...
              </div>
            ) : conversationId && messages.length === 0 ? (
              <div className="flex min-h-[360px] flex-1 items-center justify-center px-8 text-center text-sm font-semibold text-slate-500">
                该会话暂无消息
              </div>
            ) : (
              <ChatMessages
                messages={messages}
                loading={loading}
                mode={mode}
                onModeChange={setMode}
              />
            )}
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
            openAttachmentSignal={openAttachmentSignal}
            openCameraSignal={openCameraSignal}
          />
        </main>
      </div>
    </div>
  );
}
