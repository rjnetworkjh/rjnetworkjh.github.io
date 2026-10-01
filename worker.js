// Cloudflare Worker — ওয়েবসাইট থেকে Telegram-এ অর্ডার/আবেদন পাঠানোর প্রক্সি (নিরাপদ সংস্করণ)
// Worker → Settings → Variables and Secrets-এ যোগ করুন:
//   BOT_TOKEN        (Secret)
//   CHAT_ID          (Secret)
//   ALLOWED_ORIGINS  (Text)  →  https://rjnetworkjh.github.io
//
// পরিবর্তন: ALLOWED_ORIGINS খালি থাকলে এখন সব অনুরোধ বন্ধ (আগের মতো "সবার জন্য খোলা" নয়),
// এবং উত্তর JSON ({ok:true/false}) আকারে আসে।

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);

    const cors = {
      'Access-Control-Allow-Origin': originOk ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
    if (!originOk) return json({ ok: false, error: 'forbidden' }, 403);

    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_json' }, 400); }

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 3900) return json({ ok: false, error: 'invalid_text' }, 400);

    const tg = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.CHAT_ID,
        text,
        parse_mode: body.parse_mode === 'HTML' ? 'HTML' : undefined,
        disable_web_page_preview: true
      })
    });

    return json({ ok: tg.ok }, tg.ok ? 200 : 502);
  }
};
