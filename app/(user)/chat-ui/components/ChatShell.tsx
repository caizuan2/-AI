"use client";

import * as React from "react";
import { Menu, Plus } from "lucide-react";
import { askChat, fetchConversationHistory, fetchConversations } from "../api";
import {
  appendAskResult,
  createNewChatState,
  createUserMessage,
  normalizeChatMode
} from "../chat-ui-state";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";
import { ConversationSidebar } from "./ConversationSidebar";
import { ModeToggle } from "./ModeToggle";
import type { ChatConversation, ChatMessageView, ChatMode } from "../types";

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
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
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
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, loading]);

  async function handleSelectConversation(nextConversationId: string) {
    setError(null);
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
    setSidebarOpen(false);
  }

  async function handleSubmit() {
    const text = input.trim();

    if (!text || loading) {
      return;
    }

    const localUserMessage = createUserMessage(text);

    setInput("");
    setError(null);
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
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="flex h-screen overflow-hidden">
        <ConversationSidebar
          conversations={conversations}
          activeConversationId={conversationId}
          open={sidebarOpen}
          loading={conversationLoading}
          onClose={() => setSidebarOpen(false)}
          onNewChat={handleNewChat}
          onSelect={handleSelectConversation}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-3 backdrop-blur md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 md:hidden"
                aria-label="打开历史会话"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-950">AI 知识库助手</p>
                <p className="hidden text-xs text-slate-500 sm:block">基于你的知识库资料回答，不展示管理员入口</p>
              </div>
            </div>

            <div className="hidden md:block">
              <ModeToggle mode={mode} onChange={setMode} />
            </div>

            <button
              type="button"
              onClick={handleNewChat}
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">新建对话</span>
            </button>
          </header>

          <div className="border-b border-slate-200 bg-white px-3 py-3 md:hidden">
            <ModeToggle mode={mode} onChange={setMode} compact />
          </div>

          {error ? (
            <div className="mx-4 mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 md:mx-6">
              {error}
            </div>
          ) : null}

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <ChatMessages
              messages={messages}
              loading={loading}
              mode={mode}
              onModeChange={setMode}
            />
          </div>

          <ChatInput
            value={input}
            loading={loading}
            enableDeepThinking={enableDeepThinking}
            enableWebSearch={enableWebSearch}
            onValueChange={setInput}
            onToggleDeepThinking={() => setEnableDeepThinking((enabled) => !enabled)}
            onToggleWebSearch={() => setEnableWebSearch((enabled) => !enabled)}
            onSubmit={handleSubmit}
          />
        </main>
      </div>
    </div>
  );
}
