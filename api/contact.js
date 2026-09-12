/**
 * POST /api/contact — delivers the portfolio contact form via Resend.
 *
 * Environment variables (set these in Vercel → Settings → Environment Variables):
 *   RESEND_API_KEY     required. From https://resend.com/api-keys
 *   CONTACT_TO_EMAIL   optional. Defaults to the address below.
 *   CONTACT_FROM_EMAIL optional. Defaults to Resend's shared sending address,
 *                      which works with zero DNS setup. Once the custom domain
 *                      is verified in Resend, switch this to something like
 *                      "Portfolio <hello@dipalipatel.com>" for better
 *                      deliverability — shared senders land in spam more often.
 *
 * CommonJS on purpose: there is no package.json in this project, so Vercel
 * treats .js as CommonJS. Using `export default` here would fail at runtime.
 */

const TO_EMAIL = process.env.CONTACT_TO_EMAIL || 'dipali11patel@gmail.com';
const FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || 'Portfolio <onboarding@resend.dev>';

const MAX_NAME = 200;
const MAX_EMAIL = 320;
const MAX_MESSAGE = 5000;

/**
 * Best-effort per-IP rate limit. Serverless instances are ephemeral and there
 * may be several warm at once, so this is not a hard guarantee — it exists to
 * blunt naive floods. A determined spammer needs the honeypot and, if it ever
 * becomes a real problem, a Turnstile/hCaptcha token checked here.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);

  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isEmail = (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Missing request body' });
  }

  // Honeypot. Return 200 so the bot records a success and does not retry or
  // adapt; the message is simply dropped.
  if (String(body.company || '').trim() !== '') {
    return res.status(200).json({ ok: true });
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Please fill in your name, email, and a message.' });
  }
  if (name.length > MAX_NAME || email.length > MAX_EMAIL || message.length > MAX_MESSAGE) {
    return res.status(400).json({ error: 'One of those fields is too long.' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ error: 'That email address does not look valid.' });
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || ''))
    .split(',')[0].trim() || 'unknown';

  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many messages from this connection. Please try again shortly.' });
  }

  if (!process.env.RESEND_API_KEY) {
    // Logged for the Vercel dashboard; the client turns any failure into
    // "email me directly", so the visitor still has a way through.
    console.error('[contact] RESEND_API_KEY is not set — cannot send mail.');
    return res.status(500).json({ error: 'Mail is not configured yet.' });
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        reply_to: email, // so hitting Reply goes to the sender, not to Resend
        subject: `Portfolio enquiry from ${name}`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1F211C;">
            <h2 style="margin:0 0 16px;font-size:18px;">New message from your portfolio</h2>
            <p style="margin:0 0 6px;"><strong>Name:</strong> ${safeName}</p>
            <p style="margin:0 0 6px;"><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
            <hr style="border:none;border-top:1px solid #dedad2;margin:18px 0;">
            <p style="margin:0;white-space:pre-wrap;">${safeMessage}</p>
          </div>
        `,
        text: `New message from your portfolio\n\nName: ${name}\nEmail: ${email}\n\n${message}`,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      console.error('[contact] Resend rejected the request:', resendRes.status, detail);
      return res.status(502).json({ error: 'Could not send the message right now.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[contact] Unexpected failure:', err);
    return res.status(500).json({ error: 'Could not send the message right now.' });
  }
};
