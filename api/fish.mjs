// Cerise voice server: forwards her speech requests to Fish Audio.
// Fish Audio's API doesn't accept calls straight from web pages (no CORS),
// so the app sends them here and this function passes them on.
// Your Fish key comes from your phone with each request; nothing is stored here.

const ALLOWED = /^https:\/\/(cz4h467tfq-dev\.github\.io|[a-z0-9-]+\.vercel\.app)$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MODELS = ['s2.1-pro-free', 's2.1-pro', 's2-pro'];

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED.test(origin) ? origin : 'https://cz4h467tfq-dev.github.io',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, model',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('origin') || '';
    const headers = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method === 'GET') return Response.json({ ok: true, service: 'Cerise voice server' }, { headers });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
    if (origin && !ALLOWED.test(origin)) return Response.json({ message: 'This voice server only works for the Cerise app' }, { status: 403, headers });

    const auth = request.headers.get('authorization') || '';
    if (!/^Bearer \S+$/.test(auth)) return Response.json({ message: 'Missing Fish Audio key' }, { status: 401, headers });
    const asked = request.headers.get('model') || 's2.1-pro-free';
    const model = MODELS.includes(asked) ? asked : 's2.1-pro-free';
    const body = await request.text();
    if (body.length > 20000) return Response.json({ message: 'Text too long' }, { status: 413, headers });

    let upstream;
    try {
      upstream = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'model': model },
        body,
      });
    } catch (e) {
      return Response.json({ message: 'Could not reach Fish Audio' }, { status: 502, headers });
    }
    const out = new Headers(headers);
    out.set('Content-Type', upstream.headers.get('content-type') || (upstream.ok ? 'audio/wav' : 'application/json'));
    out.set('Cache-Control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
