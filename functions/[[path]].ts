/**
 * Cloudflare Pages bridge — the app only talks to coinstsorbit.pages.dev.
 * ORIGIN + BRIDGE_SECRET live in Pages env (never in the mobile app).
 */
interface Env {
  ORIGIN: string;
  BRIDGE_SECRET: string;
}

function corsHeaders(req: Request): Headers {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  h.set(
    'Access-Control-Allow-Headers',
    req.headers.get('Access-Control-Request-Headers') ||
      'Content-Type, Authorization',
  );
  h.set('Access-Control-Max-Age', '86400');
  return h;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const origin = (env.ORIGIN || '').replace(/\/$/, '');
  const secret = env.BRIDGE_SECRET || '';
  if (!origin || !secret) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Bridge misconfigured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const parts = params.path;
  const path = Array.isArray(parts)
    ? parts.join('/')
    : parts
      ? String(parts)
      : '';
  const incoming = new URL(request.url);
  const target = `${origin}/${path}${incoming.search}`;

  const headers = new Headers();
  const ct = request.headers.get('Content-Type');
  if (ct) headers.set('Content-Type', ct);
  headers.set('X-Bridge-Secret', secret);
  headers.set('Accept', 'application/json');

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: 'Origen no disponible' }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(corsHeaders(request)),
        },
      },
    );
  }

  const out = new Headers(upstream.headers);
  const cors = corsHeaders(request);
  cors.forEach((v, k) => out.set(k, v));

  return new Response(upstream.body, {
    status: upstream.status,
    headers: out,
  });
};
