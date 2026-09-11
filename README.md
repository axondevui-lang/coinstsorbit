# TsOrbit — bridge Cloudflare Pages + backend VPS

## App
La app solo usa: `https://coinstsorbit.pages.dev`

## Cloudflare Pages (puente)
1. Conectar este repo a Cloudflare Pages (output: `public`).
2. Variables de entorno (Production):
   - `ORIGIN` = `http://127.0.0.1:8787` vía tunnel, o la URL interna del backend
   - `BRIDGE_SECRET` = mismo valor que en el `.env` del backend
3. Dominio: `coinstsorbit.pages.dev`

## Backend (VPS)
```bash
cd backend
cp .env.example .env   # completar tokens
npm install
npm start
```

Systemd: servicio `tsorbit-backend` (escucha solo con `BRIDGE_SECRET`).

## Telegram
Solo admin `TELEGRAM_ADMIN_ID` puede gestionar cuentas: `correo:contraseña`
