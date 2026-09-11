# TsOrbit — bridge Cloudflare Pages + backend VPS

## App
La app solo usa: `https://coinstsorbit.pages.dev` (nunca la IP del VPS).

## Cloudflare Pages (puente)
1. Secrets de GitHub Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
2. En el proyecto Pages `coinstsorbit`, variables de entorno (Production):
   - `ORIGIN` = URL interna del backend (solo en Cloudflare)
   - `BRIDGE_SECRET` = mismo valor que en el `.env` del VPS
3. Build output: `public` · Functions: `functions/`

## Backend (VPS)
```bash
cd /opt/tsorbit-backend
# .env con TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_ID, BRIDGE_SECRET
systemctl restart tsorbit-backend
```

La API exige header `X-Bridge-Secret`. Sin él → 403 (aunque alguien sepa la IP).

## Telegram (solo admin)
`correo:contraseña` · `/list` · `/off correo`
