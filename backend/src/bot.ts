import { Telegraf } from 'telegraf';
import bcrypt from 'bcryptjs';
import {
  deactivateUser,
  findUserByEmail,
  listUsers,
  upsertActiveUser,
} from './db.js';

const EMAIL_PASS = /^([^\s:]+)\s*[:|]\s*(.+)$/;

function parseCred(text: string): { email: string; password: string } | null {
  const line = text.trim();
  const m = line.match(EMAIL_PASS);
  if (!m) return null;
  return { email: m[1].trim().toLowerCase(), password: m[2].trim() };
}

function isAdmin(userId: number | undefined): boolean {
  const adminId = Number(process.env.TELEGRAM_ADMIN_ID || 0);
  return !!adminId && userId === adminId;
}

export function startTelegramBot(token: string) {
  const bot = new Telegraf(token);

  // Solo el admin puede usar el bot. Cualquier otro usuario se ignora.
  bot.use(async (ctx, next) => {
    const uid = ctx.from?.id;
    if (!isAdmin(uid)) {
      console.warn(`[telegram] blocked uid=${uid ?? 'unknown'}`);
      return;
    }
    return next();
  });

  bot.start(async (ctx) => {
    await ctx.reply(
      [
        'TsOrbit Admin',
        '',
        'Activar cuenta (rápido):',
        'correo:contraseña',
        '',
        'Ejemplo:',
        'demo@tsorbit.com:clave123',
        '',
        'Comandos:',
        '/list — ver cuentas',
        '/off correo — desactivar',
        '/help — ayuda',
      ].join('\n'),
    );
  });

  bot.help(async (ctx) => {
    await ctx.reply(
      'Envía correo:contraseña para crear/activar.\n/list\n/off correo',
    );
  });

  bot.command('list', async (ctx) => {
    const users = listUsers();
    if (!users.length) {
      await ctx.reply('No hay cuentas todavía.');
      return;
    }
    const lines = users.map(
      (u) =>
        `#${u.id} ${u.email} — ${u.active ? 'ACTIVA' : 'OFF'} — ${u.updated_at}`,
    );
    await ctx.reply(lines.join('\n'));
  });

  bot.command('off', async (ctx) => {
    const email = ctx.message.text.replace(/^\/off(@\w+)?\s*/i, '').trim();
    if (!email) {
      await ctx.reply('Uso: /off correo');
      return;
    }
    const ok = deactivateUser(email);
    await ctx.reply(ok ? `Desactivada: ${email}` : `No existe: ${email}`);
  });

  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

    const parsed = parseCred(text);
    if (!parsed) {
      await ctx.reply('Formato: correo:contraseña');
      return;
    }
    if (parsed.password.length < 3) {
      await ctx.reply('Contraseña muy corta.');
      return;
    }

    const existed = !!findUserByEmail(parsed.email);
    const hash = await bcrypt.hash(parsed.password, 10);
    const user = upsertActiveUser(parsed.email, hash);

    await ctx.reply(
      [
        '✅ Cuenta lista',
        `Email: ${user.email}`,
        'Estado: ACTIVA',
        `Id: ${user.id}`,
        existed ? '(actualizada)' : '(nueva)',
      ].join('\n'),
    );
  });

  bot.catch((err) => {
    console.error('[telegram] handler error', err);
  });

  console.log(
    `[telegram] starting (admin=${process.env.TELEGRAM_ADMIN_ID})`,
  );
  void bot.launch({ dropPendingUpdates: true }).catch((err) => {
    console.error('[telegram] launch failed', err);
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}
