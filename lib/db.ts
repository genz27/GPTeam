import Database from 'better-sqlite3'
import crypto from 'crypto'
import path from 'path'

import { hashSecret, isHashedSecret } from '@/lib/security'

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data.db')

let db: Database.Database | null = null

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    initDb()
  }
  return db
}

function initDb() {
  const d = getDb()
  d.exec(`
    CREATE TABLE IF NOT EXISTS team_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      at_expiry TEXT,
      authorization_token TEXT,
      account_id TEXT,
      max_seats INTEGER DEFAULT 5,
      seats_entitled INTEGER DEFAULT 5,
      seats_in_use INTEGER DEFAULT 0,
      pending_invites INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      active_until TEXT,
      last_sync TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS invite_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      team_account_id INTEGER REFERENCES team_accounts(id),
      used INTEGER DEFAULT 0,
      used_email TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      type TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (type, token_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `)
  // 添加新列（如果不存在）
  try { d.exec('ALTER TABLE team_accounts ADD COLUMN refresh_token TEXT') } catch {}
  try { d.exec('ALTER TABLE team_accounts ADD COLUMN session_token TEXT') } catch {}
  try { d.exec('ALTER TABLE team_accounts ADD COLUMN access_token TEXT') } catch {}
  try { d.exec('ALTER TABLE team_accounts ADD COLUMN at_expiry TEXT') } catch {}
  try { d.exec('ALTER TABLE team_accounts ADD COLUMN token_type TEXT') } catch {}
  
  // 初始化默认设置
  initDefaultSettings(d)
  migrateSecretSettings(d)
}

function initDefaultSettings(d: Database.Database) {
  const defaultSettings = [
    { key: 'access_key', value: '' },  // 空表示不需要访问密钥
    { key: 'admin_password', value: process.env.ADMIN_PASSWORD || 'admin123' },
    { key: 'site_title', value: 'Team Invite' },
    { key: 'site_notice', value: '' },
    { key: 'proxy_enabled', value: '0' },  // 是否启用代理
    { key: 'proxy_list', value: '' }  // 代理列表，一行一个
  ]
  
  const stmt = d.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const s of defaultSettings) {
    stmt.run(s.key, s.value)
  }
}

function migrateSecretSettings(d: Database.Database) {
  const getStmt = d.prepare('SELECT value FROM settings WHERE key = ?')
  const setStmt = d.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?")

  const adminPasswordRow = getStmt.get('admin_password') as { value: string } | undefined
  if (adminPasswordRow?.value && !isHashedSecret(adminPasswordRow.value)) {
    setStmt.run(hashSecret(adminPasswordRow.value), 'admin_password')
  }

  const accessKeyRow = getStmt.get('access_key') as { value: string } | undefined
  if (accessKeyRow?.value && !isHashedSecret(accessKeyRow.value)) {
    setStmt.run(hashSecret(accessKeyRow.value), 'access_key')
  }
}

// 获取设置
export function getSetting(key: string): string | null {
  const d = getDb()
  const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

// 更新设置
export function setSetting(key: string, value: string): void {
  const d = getDb()
  d.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))').run(key, value)
}

// 获取所有设置
export function getAllSettings(): Record<string, string> {
  const d = getDb()
  const rows = d.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}

export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 12; i++) code += chars[crypto.randomInt(0, chars.length)]
  return code
}
