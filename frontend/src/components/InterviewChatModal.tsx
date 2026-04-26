import { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { normalizeMarkdown } from "../utils/markdown";

interface ChatMessage {
  role: string;
  content: string;
}

interface Interview {
  user: {
    name: string;
    archetype: string;
    context?: { name?: string; role?: string; gender?: string };
  };
  response: string;
  is_complete: boolean;
}

interface InterviewChatModalProps {
  interview: Interview;
  history: ChatMessage[];
  chatInput: string;
  chatLoading: boolean;
  onInputChange: (value: string) => void;
  onSend: (question: string, interview: Interview) => void;
  onClose: () => void;
}

export default function InterviewChatModal({
  interview,
  history,
  chatInput,
  chatLoading,
  onInputChange,
  onSend,
  onClose,
}: InterviewChatModalProps) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const personaName = interview.user.context?.name || interview.user.name;
  const isLoading =
    chatLoading &&
    history.length > 0 &&
    history[history.length - 1].role === "assistant" &&
    history[history.length - 1].content === "";

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [history]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(600px, 92vw)",
          height: "min(680px, 88vh)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div
            className="interview-avatar"
            style={{ width: 34, height: 34, fontSize: "0.85rem", flexShrink: 0 }}
          >
            {personaName?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{personaName}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {interview.user.archetype} · {interview.user.context?.role}
            </div>
          </div>
          <button
            className="btn-ghost"
            style={{ padding: "4px 8px", fontSize: "0.8rem" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div
          ref={messagesRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {history.length === 0 && (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.82rem",
                textAlign: "center",
                marginTop: 40,
              }}
            >
              Ask {personaName} anything about the idea…
            </div>
          )}
          {history.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "78%",
                  padding: "9px 13px",
                  borderRadius:
                    msg.role === "user"
                      ? "14px 14px 3px 14px"
                      : "14px 14px 14px 3px",
                  background:
                    msg.role === "user" ? "var(--primary)" : "var(--border)",
                  color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                  fontSize: "0.84rem",
                  lineHeight: 1.55,
                }}
              >
                {msg.role === "assistant" && msg.content === "" ? (
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <div className="spinner" style={{ width: 11, height: 11 }} />
                    <span style={{ fontSize: "0.77rem", color: "var(--text-muted)" }}>
                      Thinking…
                    </span>
                  </div>
                ) : (
                  <ReactMarkdown>{normalizeMarkdown(msg.content)}</ReactMarkdown>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            padding: "12px 18px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <textarea
            autoFocus
            value={chatInput}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend(chatInput, interview);
              }
            }}
            placeholder={`Ask ${personaName} a follow-up…`}
            disabled={chatLoading}
            rows={2}
            style={{
              flex: 1,
              resize: "none",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-primary)",
              fontSize: "0.84rem",
              fontFamily: "inherit",
              outline: "none",
              lineHeight: 1.5,
            }}
          />
          <button
            className="btn-primary"
            style={{ padding: "9px 18px", height: "fit-content", whiteSpace: "nowrap" }}
            disabled={chatLoading || !chatInput.trim()}
            onClick={() => onSend(chatInput, interview)}
          >
            {isLoading ? (
              <div className="spinner" style={{ width: 12, height: 12 }} />
            ) : (
              "Send"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
