import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'tsorbit.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  active: number;
  created_at: string;
  updated_at: string;
};

export function findUserByEmail(email: string): UserRow | undefined {
  return db
    .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
    .get(email.trim()) as UserRow | undefined;
}

export function listUsers(): UserRow[] {
  return db
    .prepare('SELECT * FROM users ORDER BY id DESC')
    .all() as UserRow[];
}

export function upsertActiveUser(email: string, passwordHash: string): UserRow {
  const existing = findUserByEmail(email);
  if (existing) {
    db.prepare(
      `UPDATE users
       SET password_hash = ?, active = 1, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(passwordHash, existing.id);
    return findUserByEmail(email)!;
  }

  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, active)
       VALUES (?, ?, 1)`,
    )
    .run(email.trim().toLowerCase(), passwordHash);

  return db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(info.lastInsertRowid) as UserRow;
}

export function deactivateUser(email: string): boolean {
  const result = db
    .prepare(
      `UPDATE users SET active = 0, updated_at = datetime('now')
       WHERE email = ? COLLATE NOCASE`,
    )
    .run(email.trim());
  return result.changes > 0;
}

export default db;
