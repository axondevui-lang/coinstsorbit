import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { findUserByEmail } from './db.js';
import { startTelegramBot } from './bot.js';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
/** Token de autorización API (consultas directas a la VPS sin este token → 403). */
const API_TOKEN =
  process.env.API_TOKEN ||
  process.env.BRIDGE_SECRET ||
  '';

if (!TOKEN) {
  console.error('Falta TELEGRAM_BOT_TOKEN en .env');
  process.exit(1);
}
if (!API_TOKEN) {
  console.error('Falta API_TOKEN (o BRIDGE_SECRET) en .env');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '32kb' }));

function extractApiToken(req: express.Request): string {
  const auth = req.header('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return (
    req.header('x-api-token') ||
    req.header('x-bridge-secret') ||
    ''
  ).trim();
}

/** Bloquea consultas directas a la VPS sin token. */
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (extractApiToken(req) !== API_TOKEN) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'tsorbit-backend' });
});

app.post('/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase()
      .replace(/^@+/, '');
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ ok: false, error: 'Faltan usuario o contraseña' });
      return;
    }

    const user = findUserByEmail(email);
    if (!user) {
      res.status(401).json({ ok: false, error: 'Cuenta no encontrada' });
      return;
    }
    if (!user.active) {
      res.status(403).json({ ok: false, error: 'Cuenta desactivada' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
      return;
    }

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        active: true,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error del servidor' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[api] http://${HOST}:${PORT}`);
  console.log('[api] auth: Bearer / X-Api-Token required');
  startTelegramBot(TOKEN);
});
