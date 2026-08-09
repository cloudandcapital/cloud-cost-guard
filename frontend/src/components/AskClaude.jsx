import React, { useState, useRef, useEffect } from "react";
import { parseLumenMessage } from "../lib/lumenMessage";
import { buildPresetLumenResponse, getLumenFooterLabel, SAMPLE_QUESTIONS } from "../lib/lumenPresets";

const LUMEN_ENABLED = process.env.REACT_APP_LUMEN_ENABLED === "true";

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

const renderRuns = (runs, keyPrefix) => runs.map((run, index) => (
  run.bold
    ? <strong key={`${keyPrefix}-${index}`}>{run.text}</strong>
    : <React.Fragment key={`${keyPrefix}-${index}`}>{run.text}</React.Fragment>
));

const renderMessage = (text) => parseLumenMessage(text).map((block, index) => {
  if (block.type === "heading") {
    return <h3 className={`lumen-heading lumen-heading--${block.level}`} key={`heading-${index}`}>{renderRuns(block.runs, `heading-${index}`)}</h3>;
  }
  if (block.type === "list") {
    return (
      <ul className="lumen-list" key={`list-${index}`}>
        {block.items.map((runs, itemIndex) => <li key={itemIndex}>{renderRuns(runs, `list-${index}-${itemIndex}`)}</li>)}
      </ul>
    );
  }
  if (block.type === "table") {
    return (
      <div className="lumen-table" key={`table-${index}`}>
        {block.rows.map((fields, rowIndex) => (
          <div className="lumen-table-row" key={rowIndex}>
            {fields.map((field, fieldIndex) => (
              <div className="lumen-table-field" key={fieldIndex}>
                <span className="lumen-table-label">{renderRuns(field.label, `table-${index}-${rowIndex}-${fieldIndex}-label`)}</span>
                <span>{renderRuns(field.value, `table-${index}-${rowIndex}-${fieldIndex}-value`)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return <p className="lumen-paragraph" key={`paragraph-${index}`}>{renderRuns(block.runs, `paragraph-${index}`)}</p>;
});

const AskClaude = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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
    setError(null);

    const presetReply = buildPresetLumenResponse(trimmed);
    if (presetReply) {
      setMessages([...nextMessages, { role: "assistant", content: presetReply, source: "preset" }]);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/ask-claude", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          messages: nextMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || `API error ${res.status}`);
      }

      const textBlock = Array.isArray(data?.content)
        ? data.content.find((b) => b.type === "text")
        : null;
      const reply = textBlock?.text || "(No response)";
      setMessages([...nextMessages, { role: "assistant", content: reply, source: "claude" }]);
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
        <button className="ask-claude-btn" onClick={() => setOpen(true)} aria-label="Open Lumen" data-testid="lumen-trigger">
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
        data-testid="lumen-panel"
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
                Lumen explains the validated CCAC 1.1 illustrative report. It cannot access customer accounts or external resources.
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
            placeholder="Ask about this sample report…"
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
          {getLumenFooterLabel(messages)}
        </div>
      </div>
    </>
  );
};

export default AskClaude;
