const LUMEN_SYSTEM =
  "You are Lumen, a sharp FinOps analyst assistant built into Cloud Cost Guard by Cloud & Capital. " +
  "You have the personality of a senior cloud economist — direct, data-driven, and slightly opinionated. " +
  "You always lead with the most important insight first, back it up with specific numbers from the dashboard data, " +
  "and end every response with exactly one smart follow-up question to keep the analysis going. " +
  "Keep responses under 150 words. Never hedge — give a clear recommendation. " +
  "Use bold for key numbers and percentages. " +
  "If something looks wrong or wasteful, say so directly. " +
  "Here is the current dashboard data: ";

// Rate limiting: 10 requests per IP per hour
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;
const ipRequests = new Map();

const RATE_LIMIT_MESSAGE =
  "Market Tape is free and always will be — but to keep it that way, there's a limit of 10 requests per hour. Come back soon.";

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

  const { reportData, messages } = req.body;

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
        text: LUMEN_SYSTEM + JSON.stringify(reportData),
        cache_control: { type: 'ephemeral' },
      },
    ];

    const requestBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: systemBlock,
      messages,
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

    res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=86400');
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
