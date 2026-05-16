// ─── In-memory store ───────────────────────────────────────────────────────
// Lives only while this isolate is active. No KV, no Durable Objects.
// Submissions disappear if Cloudflare spins down the isolate — intentional.
let submissions = [];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req) {
    const { pathname } = new URL(req.url);

    // Preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Receive a quiz submission
    if (req.method === 'POST' && pathname === '/submit') {
      try {
        const body = await req.json();
        submissions.unshift({ ...body, receivedAt: new Date().toISOString() });
        if (submissions.length > 500) submissions.length = 500;
        return new Response('{"ok":true}', {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      } catch {
        return new Response('{"ok":false}', {
          status: 400,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    // Polled by the admin UI every 3 seconds
    if (pathname === '/data') {
      return new Response(JSON.stringify(submissions), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Serve the admin dashboard
    return new Response(ADMIN_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};

