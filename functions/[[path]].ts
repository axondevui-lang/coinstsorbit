/**
 * Cloudflare Pages bridge — app only talks to coinstsorbit.pages.dev.
 * Prefer Pages env vars; fallbacks keep production working if unset.
 */
interface Env {
  ORIGIN?: string;
  BRIDGE_SECRET?: string;
  API_TOKEN?: string;
}

const DEFAULT_ORIGIN = 'http://169.58.253.64:8787';
const DEFAULT_TOKEN = 'uUR755Pf3Ph1AAReT40dKw9529nYH6mVVOCgBRjU_po';

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

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const origin = (env.ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, '');
  const token = env.BRIDGE_SECRET || env.API_TOKEN || DEFAULT_TOKEN;

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
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Origen no disponible',
        detail: String(err),
      }),
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
