"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PauseCircle, PlayCircle, Square } from "lucide-react";
import { sanitizeGptOSUserMessage } from "@/lib/enterprise/gpt-os-fallback-normalizer";
import { processAIOutput } from "@/lib/enterprise/gpt-os-style-layer";

type RenderPhase = "thinking" | "streaming" | "done";

type MessageRenderState = {
  isRestored?: boolean;
  isHistorical?: boolean;
  isStreaming?: boolean;
  isGenerating?: boolean;
  typing?: boolean;
  status?: string | null;
};

type MarkdownSegment =
  | { type: "line"; content: string; key: string }
  | { type: "space"; key: string }
  | { type: "code"; language: string; content: string; key: string }
  | { type: "table"; rows: string[][]; key: string };

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-slate-950">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`${part}-${index}`} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[13px] text-slate-800">
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function isTableLine(line: string) {
  const trimmed = line.trim();

  return trimmed.includes("|") && !trimmed.startsWith("```") && !/^#{1,6}\s+/.test(trimmed);
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line.trim());
}

function parseTableRows(lines: string[]) {
  return lines
    .filter((line) => !isTableSeparator(line))
    .map((line) => line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim()));
}

function splitMarkdownSegments(content: string): MarkdownSegment[] {
  const lines = content.split("\n");
  const segments: MarkdownSegment[] = [];
  let codeLanguage = "";
  let codeLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^```(\w+)?\s*$/);

    if (fenceMatch) {
      if (codeLanguage) {
        segments.push({
          type: "code",
          language: codeLanguage || "text",
          content: codeLines.join("\n"),
          key: `code-${index}`
        });
        codeLanguage = "";
        codeLines = [];
      } else {
        codeLanguage = fenceMatch[1] || "text";
        codeLines = [];
      }
      continue;
    }

    if (codeLanguage) {
      codeLines.push(line);
      continue;
    }

    if (isTableLine(line)) {
      const tableLines = [line];

      while (index + 1 < lines.length && isTableLine(lines[index + 1])) {
        index += 1;
        tableLines.push(lines[index]);
      }

      if (tableLines.length > 1 && tableLines.some(isTableSeparator)) {
        segments.push({
          type: "table",
          rows: parseTableRows(tableLines),
          key: `table-${index}`
        });
      } else {
        tableLines.forEach((tableLine, tableIndex) => {
          segments.push({
            type: tableLine.trim() ? "line" : "space",
            content: tableLine,
            key: `line-${index}-${tableIndex}`
          } as MarkdownSegment);
        });
      }
      continue;
    }

    if (!line.trim()) {
      segments.push({ type: "space", key: `space-${index}` });
      continue;
    }

    segments.push({ type: "line", content: line, key: `line-${index}` });
  }

  if (codeLanguage || codeLines.length > 0) {
    segments.push({
      type: "code",
      language: codeLanguage || "text",
      content: codeLines.join("\n"),
      key: "code-open"
    });
  }

  return segments;
}

function MarkdownBubbleContent({ content }: { content: string }) {
  const segments = splitMarkdownSegments(content);

  return (
    <div className="space-y-3 text-[15px] leading-7 text-slate-800">
      {segments.map((segment) => {
        if (segment.type === "space") {
          return <div key={segment.key} className="h-1" />;
        }

        if (segment.type === "code") {
          return (
            <pre key={segment.key} className="my-3 overflow-x-auto rounded-lg bg-slate-100 p-3 text-[13px] leading-6 text-slate-900">
              <code>{segment.content}</code>
            </pre>
          );
        }

        if (segment.type === "table") {
          return (
            <div key={segment.key} className="my-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[13px]">
                <tbody>
                  {segment.rows.map((row, rowIndex) => (
                    <tr key={`${segment.key}-${rowIndex}`} className={rowIndex === 0 ? "font-semibold text-slate-950" : "text-slate-700"}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${segment.key}-${rowIndex}-${cellIndex}`} className="border-b border-slate-200 px-2 py-2 align-top">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        const trimmed = segment.content.trim();

        if (/^#{1,4}\s+/.test(trimmed)) {
          return (
            <h3 key={segment.key} className="pt-2 text-[17px] font-semibold leading-7 text-slate-950">
              {renderInline(trimmed.replace(/^#{1,4}\s+/, ""))}
            </h3>
          );
        }

        if (/^>\s+/.test(trimmed)) {
          return (
            <blockquote key={segment.key} className="border-l-2 border-slate-300 pl-3 text-slate-600">
              {renderInline(trimmed.replace(/^>\s+/, ""))}
            </blockquote>
          );
        }

        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <p key={segment.key} className="pl-4">
              <span className="-ml-4 mr-2 text-slate-500">-</span>
              {renderInline(trimmed.replace(/^[-*]\s+/, ""))}
            </p>
          );
        }

        if (/^\d+[.)]\s+/.test(trimmed)) {
          const number = trimmed.match(/^(\d+)/)?.[1] ?? "1";

          return (
            <p key={segment.key} className="pl-6">
              <span className="-ml-6 mr-2 text-slate-500">{number}.</span>
              {renderInline(trimmed.replace(/^\d+[.)]\s+/, ""))}
            </p>
          );
        }

        return <p key={segment.key}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

function ThinkingIndicator({ phase }: { phase: RenderPhase }) {
  if (phase === "done") {
    return null;
  }

  return (
    <div className="text-sm text-slate-500">
      {phase === "thinking" ? "正在思考..." : "正在生成回答..."}
      <span className="ml-1 inline-flex gap-1 align-middle">
        <span className="h-1 w-1 animate-[gpt-dot_1s_ease-in-out_infinite] rounded-full bg-slate-400" />
        <span className="h-1 w-1 animate-[gpt-dot_1s_ease-in-out_120ms_infinite] rounded-full bg-slate-400" />
        <span className="h-1 w-1 animate-[gpt-dot_1s_ease-in-out_240ms_infinite] rounded-full bg-slate-400" />
      </span>
    </div>
  );
}

function StreamControls({
  paused,
  streaming,
  onPauseToggle,
  onStop
}: {
  paused: boolean;
  streaming: boolean;
  onPauseToggle: () => void;
  onStop: () => void;
}) {
  if (!streaming) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <button
        type="button"
        onClick={onPauseToggle}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 transition hover:bg-slate-100 hover:text-slate-800"
      >
        {paused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
        {paused ? "继续" : "暂停"}
      </button>
      <button
        type="button"
        onClick={onStop}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 transition hover:bg-slate-100 hover:text-slate-800"
      >
        <Square className="h-3.5 w-3.5" />
        停止
      </button>
    </div>
  );
}

function getChunkSize(length: number) {
  if (length > 5200) {
    return 14;
  }

  if (length > 2600) {
    return 8;
  }

  if (length > 1200) {
    return 4;
  }

  return 1;
}

export function IngestGPTMessageRenderer({
  content,
  message,
  enableTyping
}: {
  content: string;
  message?: MessageRenderState;
  enableTyping?: boolean;
}) {
  const safeContent = useMemo(() => sanitizeGptOSUserMessage(content), [content]);
  const fullMarkdown = useMemo(() => processAIOutput(safeContent, {
    source: "admin_ingest_renderer",
    mode: "chatgpt_bubble"
  }).output, [safeContent]);
  const shouldAnimate = Boolean(enableTyping ?? (
    (message?.isStreaming === true || message?.isGenerating === true || message?.typing === true || message?.status === "streaming")
    && message?.isHistorical !== true
    && message?.isRestored !== true
    && message?.status !== "completed"
  ));
  const [visibleContent, setVisibleContent] = useState("");
  const [phase, setPhase] = useState<RenderPhase>("thinking");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const stoppedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let index = 0;
    const chunkSize = getChunkSize(fullMarkdown.length);

    stoppedRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setVisibleContent("");
    setPhase("thinking");

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (delayRef.current) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }

    if (!shouldAnimate) {
      setVisibleContent(fullMarkdown);
      setPhase("done");
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        if (delayRef.current) {
          clearTimeout(delayRef.current);
          delayRef.current = null;
        }
      };
    }

    delayRef.current = setTimeout(() => {
      setPhase("streaming");
      timerRef.current = setInterval(() => {
        if (stoppedRef.current) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return;
        }

        if (pausedRef.current) {
          return;
        }

        index = Math.min(index + chunkSize, fullMarkdown.length);
        setVisibleContent(fullMarkdown.slice(0, index));

        if (index >= fullMarkdown.length) {
          setPhase("done");
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      }, 24);
    }, 500);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (delayRef.current) {
        clearTimeout(delayRef.current);
        delayRef.current = null;
      }
    };
  }, [fullMarkdown, shouldAnimate]);

  const streaming = shouldAnimate && phase !== "done";
  const renderedContent = shouldAnimate ? visibleContent || "" : fullMarkdown;

  const handlePauseToggle = () => {
    setPaused((current) => !current);
  };

  const handleStop = () => {
    stoppedRef.current = true;
    setVisibleContent(fullMarkdown);
    setPhase("done");
    setPaused(false);
  };

  return (
    <article className="w-full break-words text-slate-900">
      <style>{`
        @keyframes gpt-message-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes gpt-dot {
          0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-2px); }
        }
        @keyframes gpt-caret {
          0%, 45% { opacity: 1; }
          46%, 100% { opacity: 0; }
        }
      `}</style>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-1">
        <ThinkingIndicator phase={shouldAnimate ? phase : "done"} />
        <StreamControls paused={paused} streaming={streaming} onPauseToggle={handlePauseToggle} onStop={handleStop} />
      </div>

      <div className="animate-[gpt-message-in_240ms_ease-out_both] rounded-[18px] border border-neutral-100 bg-[#f7f7f8] px-5 py-4 shadow-none">
        {renderedContent ? (
          <MarkdownBubbleContent content={renderedContent} />
        ) : (
          <p className="text-[15px] leading-7 text-slate-500">正在准备回答...</p>
        )}
        {streaming ? <span className="ml-0.5 inline-block h-4 w-1 animate-[gpt-caret_1s_steps(1)_infinite] rounded-full bg-slate-500 align-[-2px]" /> : null}
      </div>
    </article>
  );
}
