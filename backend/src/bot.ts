import { Telegraf, Markup } from 'telegraf';
import bcrypt from 'bcryptjs';
import {
  deactivateUser,
  findUserByEmail,
  listUsers,
  upsertActiveUser,
} from './db.js';

type AwaitField = 'email' | 'password' | 'off_email' | null;

type Draft = {
  email?: string;
  password?: string;
  panelChatId?: number;
  panelMessageId?: number;
  awaiting: AwaitField;
};

const drafts = new Map<number, Draft>();

function isAdmin(userId: number | undefined): boolean {
  const adminId = Number(process.env.TELEGRAM_ADMIN_ID || 0);
  return !!adminId && userId === adminId;
}

function getDraft(uid: number): Draft {
  let d = drafts.get(uid);
  if (!d) {
    d = { awaiting: null };
    drafts.set(uid, d);
  }
  return d;
}

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🆕 Nuevo', 'menu:nuevo'),
      Markup.button.callback('📋 Cuentas', 'menu:list'),
    ],
    [
      Markup.button.callback('⛔ Desactivar', 'menu:off'),
      Markup.button.callback('❓ Ayuda', 'menu:help'),
    ],
  ]);
}

/** Usuario o correo. Acepta `tsorbit` (sin @) o `mail@x.com`. */
function normalizeUser(raw: string): string | null {
  let v = raw.trim().toLowerCase().replace(/^@+/, '');
  if (v.includes(':') || v.includes(' ')) return null;
  if (v.length < 2 || v.length > 64) return null;
  // usuario simple o correo con @
  if (v.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  } else if (!/^[a-z0-9._-]+$/i.test(v)) {
    return null;
  }
  return v;
}

function nuevoPanelText(d: Draft): string {
  const mail = d.email
    ? `✅ \`${d.email}\``
    : '⏳ pendiente';
  const pass = d.password ? '✅ `••••••••`' : '⏳ pendiente';
  return [
    '🆕 *Nueva cuenta*',
    '━━━━━━━━━━━━━━━━',
    `👤 *Usuario:* ${mail}`,
    `🔑 *Contraseña:* ${pass}`,
    '',
    'Puedes usar solo el nombre (`tsorbit`) sin @.',
    'Toca un botón de esta sección para rellenar.',
    'Al completar ambos, pulsa *Activar*.',
  ].join('\n');
}

function nuevoPanelKeyboard(d: Draft) {
  const mailBtn = d.email ? '👤 Usuario ✅' : '👤 Usuario ⏳';
  const passBtn = d.password ? '🔑 Contraseña ✅' : '🔑 Contraseña ⏳';
  const rows = [
    [
      Markup.button.callback(mailBtn, 'nuevo:email'),
      Markup.button.callback(passBtn, 'nuevo:password'),
    ],
  ];
  if (d.email && d.password) {
    rows.push([Markup.button.callback('🚀 Activar cuenta', 'nuevo:activar')]);
  }
  rows.push([
    Markup.button.callback('🧹 Limpiar', 'nuevo:clear'),
    Markup.button.callback('⬅️ Menú', 'menu:home'),
  ]);
  return Markup.inlineKeyboard(rows);
}

async function refreshNuevoPanel(ctx: any, uid: number) {
  const d = getDraft(uid);
  const text = nuevoPanelText(d);
  const kb = nuevoPanelKeyboard(d);
  if (d.panelChatId && d.panelMessageId) {
    try {
      await ctx.telegram.editMessageText(
        d.panelChatId,
        d.panelMessageId,
        undefined,
        text,
        { parse_mode: 'Markdown', ...kb },
      );
      return;
    } catch {
      /* message may be identical or gone */
    }
  }
  const sent = await ctx.reply(text, { parse_mode: 'Markdown', ...kb });
  d.panelChatId = sent.chat.id;
  d.panelMessageId = sent.message_id;
}

export function startTelegramBot(token: string) {
  const bot = new Telegraf(token);

  bot.use(async (ctx, next) => {
    const uid = ctx.from?.id;
    if (!isAdmin(uid)) {
      console.warn(`[telegram] blocked uid=${uid ?? 'unknown'}`);
      return;
    }
    return next();
  });

  bot.start(async (ctx) => {
    drafts.set(ctx.from!.id, { awaiting: null });
    await ctx.reply(
      [
        '🛰️ *TsOrbit Admin*',
        '',
        'Panel rápido con callbacks.',
        'Elige una opción:',
      ].join('\n'),
      { parse_mode: 'Markdown', ...mainMenuKeyboard() },
    );
  });

  bot.help(async (ctx) => {
    await ctx.reply(
      [
        '❓ *Ayuda*',
        '',
        '🆕 Nuevo — crear/activar con correo + contraseña',
        '📋 Cuentas — listar',
        '⛔ Desactivar — apagar una cuenta',
        '',
        'Atajo texto: `correo:contraseña`',
      ].join('\n'),
      { parse_mode: 'Markdown', ...mainMenuKeyboard() },
    );
  });

  bot.action('menu:home', async (ctx) => {
    await ctx.answerCbQuery();
    drafts.set(ctx.from!.id, { awaiting: null });
    await ctx.editMessageText(
      [
        '🛰️ *TsOrbit Admin*',
        '',
        'Panel rápido con callbacks.',
        'Elige una opción:',
      ].join('\n'),
      { parse_mode: 'Markdown', ...mainMenuKeyboard() },
    );
  });

  bot.action('menu:nuevo', async (ctx) => {
    await ctx.answerCbQuery('🆕 Nueva cuenta');
    const uid = ctx.from!.id;
    const d: Draft = { awaiting: null };
    drafts.set(uid, d);
    const text = nuevoPanelText(d);
    const kb = nuevoPanelKeyboard(d);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb });
    d.panelChatId = ctx.chat!.id;
    d.panelMessageId = ctx.callbackQuery.message
      ? 'message_id' in ctx.callbackQuery.message
        ? ctx.callbackQuery.message.message_id
        : undefined
      : undefined;
  });

  bot.action('menu:list', async (ctx) => {
    await ctx.answerCbQuery();
    const users = listUsers();
    const body = users.length
      ? users
          .map(
            (u) =>
              `${u.active ? '🟢' : '🔴'} *#${u.id}* \`${u.email}\``,
          )
          .join('\n')
      : '_No hay cuentas todavía._';
    await ctx.editMessageText(
      ['📋 *Cuentas*', '━━━━━━━━━━━━━━━━', body].join('\n'),
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Actualizar', 'menu:list')],
          [Markup.button.callback('⬅️ Menú', 'menu:home')],
        ]),
      },
    );
  });

  bot.action('menu:off', async (ctx) => {
    await ctx.answerCbQuery();
    const d = getDraft(ctx.from!.id);
    d.awaiting = 'off_email';
    await ctx.editMessageText(
      [
        '⛔ *Desactivar cuenta*',
        '',
        '✍️ Envía el *correo* a desactivar.',
      ].join('\n'),
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Menú', 'menu:home')],
        ]),
      },
    );
  });

  bot.action('menu:help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      [
        '❓ *Ayuda*',
        '',
        '🆕 Nuevo — panel usuario + contraseña con ✅',
        '📋 Cuentas — listado',
        '⛔ Desactivar — apaga una cuenta',
        '',
        'Usuario sin @: `tsorbit`',
        'Atajo: `tsorbit:clave123`',
      ].join('\n'),
      { parse_mode: 'Markdown', ...mainMenuKeyboard() },
    );
  });

  bot.action('nuevo:email', async (ctx) => {
    await ctx.answerCbQuery('👤 Usuario');
    const d = getDraft(ctx.from!.id);
    d.awaiting = 'email';
    if (ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
      d.panelChatId = ctx.chat!.id;
      d.panelMessageId = ctx.callbackQuery.message.message_id;
    }
    await ctx.reply(
      '✍️ Envía el *usuario* o correo:\nEjemplo: `tsorbit` (sin @)',
      { parse_mode: 'Markdown' },
    );
  });

  bot.action('nuevo:password', async (ctx) => {
    await ctx.answerCbQuery('🔑 Contraseña');
    const d = getDraft(ctx.from!.id);
    d.awaiting = 'password';
    if (ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
      d.panelChatId = ctx.chat!.id;
      d.panelMessageId = ctx.callbackQuery.message.message_id;
    }
    await ctx.reply('✍️ Envía ahora la *contraseña*:', {
      parse_mode: 'Markdown',
    });
  });

  bot.action('nuevo:clear', async (ctx) => {
    await ctx.answerCbQuery('Limpiado');
    const uid = ctx.from!.id;
    const d: Draft = { awaiting: null };
    if (ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
      d.panelChatId = ctx.chat!.id;
      d.panelMessageId = ctx.callbackQuery.message.message_id;
    }
    drafts.set(uid, d);
    await ctx.editMessageText(nuevoPanelText(d), {
      parse_mode: 'Markdown',
      ...nuevoPanelKeyboard(d),
    });
  });

  bot.action('nuevo:activar', async (ctx) => {
    const uid = ctx.from!.id;
    const d = getDraft(uid);
    if (!d.email || !d.password) {
      await ctx.answerCbQuery('Falta usuario o contraseña', { show_alert: true });
      return;
    }
    await ctx.answerCbQuery('Activando…');
    const existed = !!findUserByEmail(d.email);
    const hash = await bcrypt.hash(d.password, 10);
    const user = upsertActiveUser(d.email, hash);
    drafts.set(uid, { awaiting: null });
    await ctx.editMessageText(
      [
        '✅ *Cuenta lista*',
        '━━━━━━━━━━━━━━━━',
        `📧 \`${user.email}\``,
        `🆔 #${user.id}`,
        `📌 ${existed ? 'Actualizada' : 'Nueva'} · ACTIVA`,
      ].join('\n'),
      { parse_mode: 'Markdown', ...mainMenuKeyboard() },
    );
  });

  bot.command('list', async (ctx) => {
    const users = listUsers();
    if (!users.length) {
      await ctx.reply('📭 No hay cuentas todavía.', mainMenuKeyboard());
      return;
    }
    const lines = users.map(
      (u) => `${u.active ? '🟢' : '🔴'} #${u.id} ${u.email}`,
    );
    await ctx.reply(['📋 Cuentas', ...lines].join('\n'), mainMenuKeyboard());
  });

  bot.command('off', async (ctx) => {
    const email = ctx.message.text.replace(/^\/off(@\w+)?\s*/i, '').trim();
    if (!email) {
      getDraft(ctx.from.id).awaiting = 'off_email';
      await ctx.reply('✍️ Envía el correo a desactivar.');
      return;
    }
    const ok = deactivateUser(email);
    await ctx.reply(
      ok ? `⛔ Desactivada: ${email}` : `❓ No existe: ${email}`,
      mainMenuKeyboard(),
    );
  });

  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const uid = ctx.from.id;
    const d = getDraft(uid);

    if (d.awaiting === 'email') {
      const email = normalizeUser(text);
      if (!email) {
        await ctx.reply(
          '⚠️ Usuario inválido. Usa `tsorbit` o un correo.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      d.email = email;
      d.awaiting = d.password ? null : 'password';
      await ctx.reply(`✅ Usuario marcado: \`${email}\``, {
        parse_mode: 'Markdown',
      });
      await refreshNuevoPanel(ctx, uid);
      if (!d.password) {
        await ctx.reply('👉 Ahora toca *🔑 Contraseña* o envíala aquí.', {
          parse_mode: 'Markdown',
        });
      }
      return;
    }

    if (d.awaiting === 'password') {
      if (text.length < 3) {
        await ctx.reply('⚠️ Contraseña muy corta.');
        return;
      }
      d.password = text;
      d.awaiting = null;
      await ctx.reply('✅ Contraseña marcada.');
      await refreshNuevoPanel(ctx, uid);
      if (d.email && d.password) {
        await ctx.reply('🚀 Ambos listos. Pulsa *Activar cuenta*.', {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Activar cuenta', 'nuevo:activar')],
          ]),
        });
      }
      return;
    }

    if (d.awaiting === 'off_email') {
      d.awaiting = null;
      const ok = deactivateUser(text);
      await ctx.reply(
        ok ? `⛔ Desactivada: ${text}` : `❓ No existe: ${text}`,
        mainMenuKeyboard(),
      );
      return;
    }

    // atajo: usuario:contraseña (sin @ obligatorio)
    const m = text.match(/^([^\s:]+)\s*[:|]\s*(.+)$/);
    if (m) {
      const email = normalizeUser(m[1]);
      const password = m[2].trim();
      if (!email) {
        await ctx.reply('⚠️ Usuario inválido.');
        return;
      }
      if (password.length < 3) {
        await ctx.reply('⚠️ Contraseña muy corta.');
        return;
      }
      const existed = !!findUserByEmail(email);
      const hash = await bcrypt.hash(password, 10);
      const user = upsertActiveUser(email, hash);
      await ctx.reply(
        [
          '✅ Cuenta lista',
          `📧 ${user.email}`,
          `🆔 #${user.id}`,
          existed ? 'Actualizada' : 'Nueva',
        ].join('\n'),
        mainMenuKeyboard(),
      );
      return;
    }

    await ctx.reply(
      'Usa el menú o el atajo `correo:contraseña`.',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() },
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
