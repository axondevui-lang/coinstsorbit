/**
 * Cloudflare Pages bridge — app only talks to coinstsorbit.pages.dev.
 * VPS IP lives ONLY in Cloudflare Pages env `ORIGIN` (never in the app).
 *
 * Required Pages env (Production):
 *   ORIGIN=http://<VPS_IP>:8080
 *   BRIDGE_SECRET=<same as VPS API_TOKEN / BRIDGE_SECRET>
 */
interface Env {
  ORIGIN?: string;
  BRIDGE_SECRET?: string;
  API_TOKEN?: string;
}

function corsHeaders(req: Request): Headers {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  h.set(
    'Access-Control-Allow-Headers',
    req.headers.get('Access-Control-Request-Headers') ||
      'Content-Type, Authorization, X-Api-Token, X-Bridge-Secret',
  );
  h.set('Access-Control-Max-Age', '86400');
  return h;
}

function jsonError(
  req: Request,
  status: number,
  error: string,
  detail?: string,
): Response {
  return new Response(JSON.stringify({ ok: false, error, detail }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...Object.fromEntries(corsHeaders(req)),
    },
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const origin = (env.ORIGIN || '').trim().replace(/\/$/, '');
  const token = (env.BRIDGE_SECRET || env.API_TOKEN || '').trim();

  if (!origin) {
    return jsonError(
      request,
      500,
      'ORIGIN no configurado en Cloudflare Pages',
    );
  }
  if (!token) {
    return jsonError(
      request,
      500,
      'BRIDGE_SECRET no configurado en Cloudflare Pages',
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
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Api-Token', token);
  headers.set('X-Bridge-Secret', token);
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
  } catch (err) {
    return jsonError(request, 502, 'Origen no disponible', String(err));
  }

  const out = new Headers(upstream.headers);
  const cors = corsHeaders(request);
  cors.forEach((v, k) => out.set(k, v));

  return new Response(upstream.body, {
    status: upstream.status,
    headers: out,
  });
};
