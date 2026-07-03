"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Loader2, Sparkles, Maximize2, Minimize2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askAnalyst, type AnalystMessage } from "@/lib/api";

const SUGGESTIONS = [
  "現在市場有什麼值得注意的?",
  "幫我看 BTCUSDT 的結構",
  "有哪些疑似反轉的幣?",
  "查一下 PEPE 的代幣資訊和價格"
];

const MD_CLASS =
  "prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:mb-1.5 prose-headings:mt-2.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-hr:my-2.5 prose-table:my-2 prose-blockquote:my-2 prose-pre:my-2";

export function AnalystChat() {
  const [messages, setMessages] = useState<AnalystMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Typewriter: `pending` holds the full reply; `shown` how many chars revealed.
  const [pending, setPending] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const busy = loading || pending !== null;

  useEffect(() => {
    if (pending === null) return;
    if (shown >= pending.length) {
      setMessages((prev) => [...prev, { role: "assistant", content: pending }]);
      setPending(null);
      setShown(0);
      return;
    }
    const chunk = Math.max(1, Math.ceil(pending.length / 90)); // ~90 ticks total
    const id = setTimeout(() => {
      setShown((s) => Math.min(s + chunk, pending.length));
      listRef.current?.scrollTo({ top: 1e9 });
    }, 16);
    return () => clearTimeout(id);
  }, [pending, shown]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next: AnalystMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await askAnalyst(next);
      setPending(res.reply); // start typewriter
      setShown(0);
    } catch (err) {
      setMessages([
        ...next,
        { role: "assistant", content: err instanceof Error ? err.message : "發生錯誤" }
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: 1e9 }));
    }
  }

  const panel = (
    <div className="surface flex h-full flex-col overflow-hidden rounded-lg">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Bot className="h-4 w-4 text-gold" />
        <span className="text-sm font-semibold text-slate-50">CT_Trader 分析師</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "縮小" : "放大"}
          className="ml-auto text-slate-400 transition hover:text-ember"
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && pending === null ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-slate-300">
              <Sparkles className="h-4 w-4 text-ember" />
              問我市場、某個幣、或哪些異常。
            </p>
            <p className="text-xs leading-5 text-slate-600">
              分數=訊號異常強度，非上漲機率；數據判讀，非投資建議。
            </p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="surface lift rounded-md px-3 py-2 text-left text-xs text-slate-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[88%] whitespace-pre-wrap rounded-lg bg-ember/15 px-3 py-2 text-sm leading-6 text-slate-50">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[92%] overflow-x-auto rounded-lg surface-sunken px-3 py-2 text-slate-200">
                  <div className={MD_CLASS}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )
          )
        )}

        {pending !== null ? (
          <div className="flex justify-start">
            <div className="max-w-[92%] overflow-x-auto rounded-lg surface-sunken px-3 py-2 text-slate-200">
              <div className={MD_CLASS}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{pending.slice(0, shown)}</ReactMarkdown>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-start">
            <div className="surface-sunken inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              分析中…
            </div>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-white/10 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="輸入問題…"
          className="flex-1 rounded-md border border-white/10 bg-obsidian/60 px-3 py-2 text-sm text-slate-50 outline-none transition placeholder:text-slate-600 focus:border-ember/60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ember/40 bg-ember/15 text-ember transition hover:bg-ember/25 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <div className="h-[88vh] w-full max-w-3xl">{panel}</div>
      </div>
    );
  }

  return panel;
}
