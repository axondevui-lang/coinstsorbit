# TsOrbit bridge — https://tsorbittikitoko.pages.dev

Repo **público**. Cloudflare Pages lee este GitHub y despliega solo.

## Qué hay aquí
- `public/index.html` — pantalla “Server running” (terror)
- `public/_routes.json` — el HTML no pasa por la Function
- `functions/[[path]].ts` — puente API (`/health`, `/auth/*`) → VPS `:8880`

La app móvil solo usa `https://tsorbittikitoko.pages.dev` (nunca la IP).

## Cloudflare Pages
1. Workers & Pages → Create / Connect to Git  
2. Repo: `axondevui-lang/coinstsorbit`  
3. Project name: `tsorbittikitoko`  
4. Build: output `public` (o framework = None)  
5. Deploy

Variables de entorno son **opcionales** (el bridge ya trae fallback). Si quieres:
- `ORIGIN` = `http://TU_IP_VPS:8880`
- `BRIDGE_SECRET` = mismo del `.env` del VPS

## Backend VPS
`PORT=8880` · `HOST=0.0.0.0` · token obligatorio · `ufw allow 8880/tcp`
