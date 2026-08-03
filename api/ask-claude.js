const TRUSTED_REPORT = require('../frontend/src/data/report.json');

const LUMEN_SYSTEM =
  "You are Lumen, the FinOps analyst inside Cloud Cost Guard by Cloud & Capital. " +
  "Be direct, concise, and evidence-led. Lead with the most important supported observation and cite the relevant demo numbers. " +
  "The dashboard contains illustrative sample data, not customer or production data. Never imply otherwise. " +
  "The supplied report is a fixed, completed 30-day sample window, not a live or month-to-date billing period. " +
  "Do not claim there are days remaining, budget remaining, month-to-date results, or an incomplete period unless the supplied report explicitly contains evidence supporting that exact statement. " +
  "Clearly distinguish observed cost, anomaly, estimated opportunity, and verified savings. " +
  "Use only opportunity_catalog and opportunity_aggregates when quoting optimization amounts. Name each scope, never invent or silently add estimates, and never add entries marked as potentially overlapping. " +
  "Treat untagged spend as unattributed cost and an allocation problem, never as automatic savings. Use the plain wording 'untagged spend'. " +
  "Do not claim an operational change is risk-free. Do not say that a resource was fixed, deleted, resized, or changed. " +
  "For remediation questions, recommend review, owner approval, a dry run, rollback planning, and post-change verification. " +
  "Keep responses under 150 words. State uncertainty when the supplied evidence is insufficient. " +
  "Use bold for key numbers and percentages. Never use Markdown tables; use short bullets with one labeled fact per line because the chat panel is narrow. " +
  "Ask at most one useful follow-up question when additional context would materially improve the answer. " +
  "Here is the trusted illustrative dashboard data: ";

// Best-effort per-instance rate limiting. A shared store is required before
// treating this as a production-grade distributed limit.
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;
const ipRequests = new Map();

const RATE_LIMIT_MESSAGE =
  "Cloud Cost Guard's public demo is limited to 10 Lumen questions per hour. Please come back soon.";

const MAX_USER_INPUT_CHARS = 2000;

function checkRateLimit(ip) {
  const now = Date.now();
  const record = ipRequests.get(ip);
  if (!record || now > record.resetAt) {
    ipRequests.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (record.count >= RATE_LIMIT) return false;
  record.count++;
  return true;
}

function sanitizeMessages(messages) {
  return messages.map((message) => ({
    role: message?.role === 'assistant' ? 'assistant' : 'user',
    content: typeof message?.content === 'string' ? message.content.slice(0, MAX_USER_INPUT_CHARS) : '',
  })).filter((message) => message.content.trim().length > 0);
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: RATE_LIMIT_MESSAGE });
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'Lumen is temporarily unavailable.' });
  }

  if (messages.length === 0 || messages.length > 20) {
    return res.status(400).json({ error: 'Please send between 1 and 20 chat messages.' });
  }

  const safeMessages = sanitizeMessages(messages);

  // Input size cap
  if (Array.isArray(messages) && messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (typeof lastMsg?.content === 'string' && lastMsg.content.length > MAX_USER_INPUT_CHARS) {
      return res.status(400).json({ error: 'Message too long. Please keep questions under 2,000 characters.' });
    }
  }

  try {
    // System prompt with cache_control — the static preamble + dashboard JSON
    // (~2,800 tokens of static data) is cached so repeat callers pay ~10% input cost
    const systemBlock = [
      {
        type: 'text',
        text: LUMEN_SYSTEM + JSON.stringify(TRUSTED_REPORT),
        cache_control: { type: 'ephemeral' },
      },
    ];

    const requestBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: systemBlock,
      messages: safeMessages,
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = handler;
module.exports._internals = {
  LUMEN_SYSTEM,
  TRUSTED_REPORT,
  RATE_LIMIT_MESSAGE,
  checkRateLimit,
  sanitizeMessages,
};
