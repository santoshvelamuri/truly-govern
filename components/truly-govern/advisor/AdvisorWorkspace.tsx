"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Send, Loader2, ThumbsUp, ThumbsDown, AlertTriangle, Info, MessageSquare, MoreHorizontal, Pencil, Trash2, Check, X } from "lucide-react";
import { CONFIDENCE_COLORS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";
import CitationDrawer from "@/components/truly-govern/advisor/CitationDrawer";

// ── Types ────────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  title: string | null;
  updated_at: string;
}

interface CitationData {
  policy_id: string;
  policy_title: string;
  clause_heading: string;
  chunk_content: string;
  similarity: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: "high" | "medium" | "low";
  had_conflict?: boolean;
  citations?: CitationData[];
  feedback?: "helpful" | "not_helpful" | null;
  isStreaming?: boolean;
}

interface AdvisorWorkspaceProps {
  onNavigate: (view: GovernanceView) => void;
}

const EXAMPLE_QUESTIONS = [
  "What authentication method should we use for external APIs?",
  "What is our policy on container image security?",
  "How should we handle data classification for PII?",
];

// ── Component ────────────────────────────────────────────────────────────────

export default function AdvisorWorkspace({ onNavigate }: AdvisorWorkspaceProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [activeCitation, setActiveCitation] = useState<CitationData | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Load sessions ──────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/truly-govern/advisor/sessions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setSessions(json.data ?? []);
    setLoadingSessions(false);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ── Load messages for active session ───────────────────────────────────

  const loadMessages = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from("advisor_logs")
      .select("id, question, answer, confidence, had_conflict, policy_ids_used, feedback, citations_json")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const msgs: Message[] = [];
    for (const log of data ?? []) {
      msgs.push({
        id: `q-${log.id}`,
        role: "user",
        content: log.question,
      });
      msgs.push({
        id: log.id,
        role: "assistant",
        content: log.answer,
        confidence: log.confidence,
        had_conflict: log.had_conflict,
        feedback: log.feedback,
        citations: log.citations_json ?? [],
      });
    }
    setMessages(msgs);
  }, []);

  useEffect(() => {
    if (activeSessionId && !isStreaming) {
      loadMessages(activeSessionId);
    } else if (!activeSessionId) {
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, loadMessages]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Create new session ─────────────────────────────────────────────────

  async function createSession() {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/truly-govern/advisor/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.data) {
      setSessions((prev) => [json.data, ...prev]);
      setActiveSessionId(json.data.id);
      setMessages([]);
    }
  }

  // ── Close menu on outside click ────────────────────────────────────────

  useEffect(() => {
    if (!menuOpenId) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpenId]);

  // ── Rename session ─────────────────────────────────────────────────────

  function startRename(session: Session) {
    setRenamingId(session.id);
    setRenameValue(session.title || "");
    setMenuOpenId(null);
  }

  async function saveRename(id: string) {
    const title = renameValue.trim();
    if (!title) { setRenamingId(null); return; }
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/advisor/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, title }),
    });
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    setRenamingId(null);
  }

  // ── Delete session ─────────────────────────────────────────────────────

  async function deleteSession(id: string) {
    setMenuOpenId(null);
    if (!confirm("Delete this conversation and all its messages?")) return;
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/advisor/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
  }

  // ── Send message (SSE streaming) ───────────────────────────────────────

  async function sendMessage(question?: string) {
    const q = question ?? input.trim();
    if (!q || isStreaming) return;

    // Auto-create session if none active
    let sessionId = activeSessionId;
    if (!sessionId) {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/truly-govern/advisor/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.data) return;
      sessionId = json.data.id;
      setSessions((prev) => [json.data, ...prev]);
      setActiveSessionId(sessionId);
    }

    setInput("");
    setIsStreaming(true);

    // Add user message
    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: q },
      { id: assistantMsgId, role: "assistant", content: "", isStreaming: true },
    ]);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/truly-govern/advisor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId, question: q }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Failed to connect to advisor");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "delta") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + event.content }
                    : m,
                ),
              );
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        id: event.message_id ?? assistantMsgId,
                        isStreaming: false,
                        confidence: event.confidence,
                        had_conflict: event.had_conflict,
                        citations: event.citations ?? [],
                      }
                    : m,
                ),
              );
              // Refresh session list to update title
              loadSessions();
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: `Error: ${event.message}`, isStreaming: false }
                    : m,
                ),
              );
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `Error: ${msg}`, isStreaming: false }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  // ── Feedback ───────────────────────────────────────────────────────────

  async function sendFeedback(messageId: string, feedback: "helpful" | "not_helpful") {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/advisor/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message_id: messageId, feedback }),
    });
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)),
    );
  }

  // ── Handle Enter key ──────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ── Render citation links in text ──────────────────────────────────────

  function findCitation(text: string, citations: CitationData[]): CitationData | undefined {
    const lower = text.toLowerCase().replace(/["']/g, "").trim();
    return citations.find(
      (c) => {
        const title = c.policy_title.toLowerCase();
        const clause = (c.clause_heading || "").toLowerCase();
        return title.includes(lower) || lower.includes(title) ||
               (clause && (clause.includes(lower) || lower.includes(clause)));
      },
    );
  }

  function renderContent(content: string, citations?: CitationData[]) {
    if (!citations || citations.length === 0) return content;

    // Match citation brackets: [Policy: X], [ADR: X], [X — Y], [X, Clause: Y], etc.
    const citationPattern = /(\[(?:Policy:\s*|ADR:\s*)?[^\]]{3,}\])/g;
    const parts = content.split(citationPattern);

    const rendered = parts.map((part, i) => {
      const bracketMatch = part.match(/^\[(.+)\]$/);
      if (!bracketMatch) return <span key={i}>{part}</span>;

      let inner = bracketMatch[1].trim();

      // Check if this is an ADR citation
      const adrMatch = inner.match(/^ADR:\s*(.+)$/i);
      if (adrMatch) {
        const adrTitle = adrMatch[1].replace(/^["']|["']$/g, "").trim();
        return (
          <button
            key={i}
            onClick={() => {
              // Search for matching ADR by title and navigate
              supabase.from("adrs").select("id").ilike("title", `%${adrTitle}%`).limit(1).single()
                .then(({ data }) => {
                  if (data?.id) onNavigate({ page: "adrs-detail", id: data.id });
                });
            }}
            className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            ↗ ADR: {adrTitle}
          </button>
        );
      }

      // Strip "Policy:" prefix if present
      inner = inner.replace(/^Policy:\s*/i, "");
      // Strip leading ↗
      inner = inner.replace(/^↗\s*/, "");

      // Extract policy and clause parts
      let policyPart = inner;
      let clausePart = "";
      const clauseMatch = inner.match(/^(.+?)(?:,\s*Clause:\s*|(?:\s*[—–-]\s*))(.+)$/i);
      if (clauseMatch) {
        policyPart = clauseMatch[1].trim();
        clausePart = clauseMatch[2].trim();
      }
      policyPart = policyPart.replace(/^["']|["']$/g, "").trim();

      const citation = findCitation(policyPart, citations) ||
                       (clausePart ? findCitation(clausePart, citations) : undefined);

      if (citation) {
        return (
          <button
            key={i}
            onClick={() => setActiveCitation(citation)}
            className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
          >
            ↗ {policyPart}
          </button>
        );
      }

      return (
        <span key={i} className="inline-flex items-center rounded bg-neutral-50 px-1 py-0.5 text-xs font-medium text-neutral-500">
          [{policyPart}]
        </span>
      );
    });

    return rendered;
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const isEmptySession = !activeSessionId || messages.length === 0;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Session list */}
      <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-3">
          <span className="text-sm font-semibold text-neutral-900">Conversations</span>
          <button onClick={createSession} className="rounded-md bg-neutral-900 p-1.5 text-white hover:bg-neutral-800">
            <Plus size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-neutral-400" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-neutral-400">
              No conversations yet
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`group relative flex items-center px-3 py-2.5 transition-colors ${
                  activeSessionId === s.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                }`}
              >
                {renamingId === s.id ? (
                  /* Inline rename input */
                  <div className="flex w-full items-center gap-1">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(s.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="flex-1 rounded border border-neutral-300 px-1.5 py-0.5 text-sm focus:border-neutral-500 focus:outline-none"
                      autoFocus
                    />
                    <button onClick={() => saveRename(s.id)} className="rounded p-0.5 text-neutral-500 hover:text-emerald-600">
                      <Check size={13} />
                    </button>
                    <button onClick={() => setRenamingId(null)} className="rounded p-0.5 text-neutral-500 hover:text-red-500">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  /* Normal session row */
                  <>
                    <button
                      onClick={() => setActiveSessionId(s.id)}
                      className="flex flex-1 flex-col gap-0.5 text-left min-w-0"
                    >
                      <span className="truncate text-sm font-medium text-neutral-800">
                        {s.title || "New conversation"}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {new Date(s.updated_at).toLocaleDateString()}
                      </span>
                    </button>

                    {/* Three-dot menu trigger */}
                    <div className="relative shrink-0" ref={menuOpenId === s.id ? menuRef : undefined}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === s.id ? null : s.id); }}
                        className="rounded p-1 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-200 hover:text-neutral-600 data-[open=true]:opacity-100"
                        data-open={menuOpenId === s.id}
                      >
                        <MoreHorizontal size={14} />
                      </button>

                      {menuOpenId === s.id && (
                        <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
                          <button
                            onClick={() => startRename(s)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                          >
                            <Pencil size={12} /> Rename
                          </button>
                          <button
                            onClick={() => deleteSession(s.id)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isEmptySession ? (
            <div className="flex h-full flex-col items-center justify-center">
              <MessageSquare size={40} className="mb-4 text-neutral-300" />
              <h2 className="text-lg font-semibold text-neutral-700">Governance Advisor</h2>
              <p className="mt-1 text-sm text-neutral-500">Ask questions about your architecture standards and policies.</p>
              <div className="mt-6 flex flex-col gap-2">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-left text-sm text-neutral-700 shadow-sm hover:border-neutral-300 hover:bg-neutral-50 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] ${m.role === "user" ? "rounded-2xl rounded-br-md bg-neutral-900 px-4 py-2.5 text-sm text-white" : "w-full"}`}>
                    {m.role === "user" ? (
                      m.content
                    ) : (
                      <div className="rounded-2xl rounded-bl-md border border-neutral-200 bg-white px-4 py-3 shadow-sm">
                        {/* Confidence badge */}
                        {m.confidence && !m.isStreaming && (
                          <div className="mb-2 flex items-center justify-end">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CONFIDENCE_COLORS[m.confidence]}`}>
                              {m.confidence}
                            </span>
                          </div>
                        )}

                        {/* Conflict banner */}
                        {m.had_conflict && !m.isStreaming && (
                          <div className="mb-2 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            <AlertTriangle size={14} /> Conflicting policies detected — review citations carefully
                          </div>
                        )}

                        {/* Low confidence banner */}
                        {m.confidence === "low" && !m.isStreaming && (
                          <div className="mb-2 flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                            <Info size={14} /> Limited policy coverage found. This answer may be incomplete.
                          </div>
                        )}

                        {/* Answer text */}
                        <div className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">
                          {m.isStreaming && !m.content ? (
                            <div className="flex items-center gap-2 text-neutral-400">
                              <Loader2 size={14} className="animate-spin" /> Thinking...
                            </div>
                          ) : (
                            renderContent(m.content, m.citations)
                          )}
                        </div>

                        {/* Streaming indicator */}
                        {m.isStreaming && m.content && (
                          <span className="inline-block h-3 w-1 animate-pulse bg-neutral-400 ml-0.5" />
                        )}

                        {/* Feedback */}
                        {!m.isStreaming && m.role === "assistant" && m.content && !m.content.startsWith("Error:") && (
                          <div className="mt-3 flex items-center gap-1 border-t border-neutral-100 pt-2">
                            <button
                              onClick={() => sendFeedback(m.id, "helpful")}
                              className={`rounded p-1 transition-colors ${m.feedback === "helpful" ? "bg-emerald-50 text-emerald-600" : "text-neutral-300 hover:text-neutral-500"}`}
                              title="Helpful"
                            >
                              <ThumbsUp size={14} />
                            </button>
                            <button
                              onClick={() => sendFeedback(m.id, "not_helpful")}
                              className={`rounded p-1 transition-colors ${m.feedback === "not_helpful" ? "bg-red-50 text-red-500" : "text-neutral-300 hover:text-neutral-500"}`}
                              title="Not helpful"
                            >
                              <ThumbsDown size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-neutral-200 bg-white px-6 py-3">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your architecture standards..."
                disabled={isStreaming}
                rows={1}
                className="flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm transition-colors focus:border-neutral-500 focus:outline-none disabled:opacity-50"
                style={{ maxHeight: "120px" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 120) + "px";
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isStreaming || !input.trim()}
                className="rounded-lg bg-neutral-900 p-2.5 text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
              >
                {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Citation drawer */}
      <CitationDrawer
        citation={activeCitation}
        onClose={() => setActiveCitation(null)}
        onNavigate={onNavigate}
      />
    </div>
  );
}
