import React, { useState, useRef, useEffect } from "react";
import { getCloudCapitalReport } from "../lib/report";

const LUMEN_ENABLED = process.env.REACT_APP_LUMEN_ENABLED === "true";

const SAMPLE_QUESTIONS = [
  "What's bleeding money right now?",
  "Where should I cut first?",
  "Is my AI spend worth it?",
  "What's my biggest risk this month?",
  "Any SaaS I should cancel?",
  "How's my tagging coverage?",
  "What will I spend next month?"
];

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const CloseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const renderMessage = (text) => {
  return text.split("\n").flatMap((line, li, lines) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
    return li < lines.length - 1 ? [...parts, <br key={`br-${li}`} />] : parts;
  });
};

const getSafeReport = (report) => {
  const safeReport = { ...report };
  if (safeReport.cost_baseline) {
    const cb = { ...safeReport.cost_baseline };
    delete cb.raw;
    safeReport.cost_baseline = cb;
  }
  return safeReport;
};

const AskClaude = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const reportData = getSafeReport(getCloudCapitalReport());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ask-claude", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          reportData,
          messages: nextMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      const data = await res.json();
      console.log(data);

      if (!res.ok) {
        throw new Error(data.error?.message || `API error ${res.status}`);
      }

      const textBlock = Array.isArray(data?.content)
        ? data.content.find((b) => b.type === "text")
        : null;
      const reply = textBlock?.text || "(No response)";
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!LUMEN_ENABLED) {
    return (
      <p className="ask-claude-unavailable">Lumen unavailable</p>
    );
  }

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button className="ask-claude-btn" onClick={() => setOpen(true)} aria-label="Open Lumen">
          <span className="ask-claude-sparkle" aria-hidden="true">✦</span>
          Lumen
        </button>
      )}

      {/* Backdrop — click to close */}
      {open && (
        <div
          className="ask-claude-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in panel */}
      <div
        className={`ask-claude-panel${open ? " ask-claude-panel--open" : ""}`}
        role="dialog"
        aria-label="Lumen assistant"
      >
        {/* Header */}
        <div className="ask-claude-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="ask-claude-sparkle" style={{ color: "#8B6F47", fontSize: 16 }}>✦</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#0A0A0A", lineHeight: 1.2 }}>Lumen</div>
              <div style={{ fontSize: 10, color: "#9B8E83", lineHeight: 1.2 }}>FinOps AI · Cloud &amp; Capital</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {messages.length > 0 && (
              <button
                className="ask-claude-icon-btn"
                onClick={() => setMessages([])}
                title="New chat"
                style={{ fontSize: 10, padding: "3px 7px", borderRadius: 4, color: "#9B8E83" }}
              >
                New chat
              </button>
            )}
            <button
              className="ask-claude-icon-btn"
              onClick={() => setOpen(false)}
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="ask-claude-messages">

          {/* Sample chips (shown before first message) */}
          {messages.length === 0 && !loading && (
            <div className="ask-claude-chips">
              <p style={{ fontSize: 12, color: "#7A6B5D", textAlign: "center", marginBottom: 10 }}>
                Ask about your cost data
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {SAMPLE_QUESTIONS.map((q, i) => (
                  <button key={i} className="ask-claude-chip" onClick={() => sendMessage(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat bubbles */}
          {messages.map((msg, i) => (
            <div key={i} className={`ask-claude-row${msg.role === "user" ? " ask-claude-row--user" : ""}`}>
              <div className={`ask-claude-bubble ask-claude-bubble--${msg.role}`}>
                {msg.role === "assistant" ? renderMessage(msg.content) : msg.content}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="ask-claude-row">
              <div className="ask-claude-bubble ask-claude-bubble--assistant ask-claude-typing">
                <span className="ask-claude-dot" />
                <span className="ask-claude-dot" />
                <span className="ask-claude-dot" />
              </div>
            </div>
          )}

          {/* Error */}
          {error && <div className="ask-claude-error">{error}</div>}

          <div ref={messagesEndRef} />
        </div>

        {/* Input row */}
        <div className="ask-claude-input-row">
          <input
            ref={inputRef}
            type="text"
            className="ask-claude-input"
            placeholder="Ask about your costs…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            className="ask-claude-send"
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            aria-label="Send"
          >
            <SendIcon />
          </button>
        </div>

        {/* Footer */}
        <div className="ask-claude-footer">
          Powered by Claude · Cloud &amp; Capital
        </div>
      </div>
    </>
  );
};

export default AskClaude;
