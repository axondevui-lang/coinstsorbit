# TsOrbit — bridge Cloudflare Pages + backend VPS

## App
La app **solo** usa: `https://coinstsorbit.pages.dev`  
Nunca hardcodea la IP del VPS.

## Flujo
```
App (cualquier red IPv4/IPv6)
  → https://coinstsorbit.pages.dev   (puente Cloudflare)
    → ORIGIN (IP VPS, solo en env de Cloudflare Pages)
      → backend con token BRIDGE_SECRET
```

## GitHub → Cloudflare
Secrets del repo (`Settings → Secrets → Actions`):

| Secret | Ejemplo | Uso |
|--------|---------|-----|
| `CLOUDFLARE_API_TOKEN` | token CF | Deploy Pages |
| `CLOUDFLARE_ACCOUNT_ID` | account id | Deploy Pages |
| `VPS_ORIGIN` | `http://x.x.x.x:8880` | IP del VPS (solo Cloudflare) |
| `BRIDGE_SECRET` | mismo que VPS `.env` | Auth puente → backend |

Al hacer push a `main`, el workflow:
1. Sincroniza `ORIGIN` + `BRIDGE_SECRET` en el proyecto Pages
2. Despliega `public/` + `functions/`

Puerto del backend: **8880** (permitido por Cloudflare Workers; `8787` no lo es).

## Backend (VPS)
```bash
cd /opt/tsorbit-backend
# .env: TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_ID, BRIDGE_SECRET, PORT=8880, HOST=0.0.0.0
systemctl restart tsorbit-backend
ufw allow 8880/tcp
```

Sin `Authorization: Bearer <BRIDGE_SECRET>` (o `X-Api-Token`) → 401.
