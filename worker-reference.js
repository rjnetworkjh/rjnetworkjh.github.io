// Optional reference — শুধু দরকার হলে ব্যবহার করুন (আপনার বর্তমান Worker ঠিকমতো চললে বদলানোর দরকার নেই)
// Worker Settings → Variables and Secrets এ যোগ করুন:
//   BOT_TOKEN (Secret), CHAT_ID (Secret), ALLOWED_ORIGINS (যেমন: https://yourdomain.com,https://user.github.io)

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const originOk = allowed.length === 0 || allowed.includes(origin);

    const cors = {
      'Access-Control-Allow-Origin': allowed.length === 0 ? '*' : (originOk ? origin : 'null'),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
    if (!originOk) return new Response('Forbidden', { status: 403, headers: cors });

    let body;
    try { body = await request.json(); } catch (e) { return new Response('Bad JSON', { status: 400, headers: cors }); }

    const text = typeof body.text === 'string' ? body.text : '';
    if (!text || text.length > 3900) return new Response('Invalid text', { status: 400, headers: cors });

    const tg = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.CHAT_ID,
        text: text,
        parse_mode: body.parse_mode === 'HTML' ? 'HTML' : undefined,
        disable_web_page_preview: true
      })
    });

    return new Response(tg.ok ? 'ok' : 'telegram error', { status: tg.ok ? 200 : 502, headers: cors });
  }
};
