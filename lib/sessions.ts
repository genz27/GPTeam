import crypto from 'crypto'

import { getDb } from '@/lib/db'
import { sha256Hex } from '@/lib/security'

export type SessionType = 'admin' | 'access'

export const ADMIN_SESSION_COOKIE = 'admin_session'
export const ACCESS_SESSION_COOKIE = 'access_session'

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export function pruneExpiredSessions(): void {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowSeconds())
}

export function createSession(type: SessionType, maxAgeSeconds: number): string {
  const db = getDb()
  pruneExpiredSessions()

  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = sha256Hex(token)
  const createdAt = nowSeconds()
  const expiresAt = createdAt + Math.max(1, maxAgeSeconds)

  db.prepare(
    'INSERT INTO sessions (type, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(type, tokenHash, createdAt, expiresAt)

  return token
}

export function isSessionValid(type: SessionType, token: string | null | undefined): boolean {
  if (!token) return false

  const db = getDb()
  pruneExpiredSessions()

  const tokenHash = sha256Hex(token)
  const row = db
    .prepare('SELECT 1 FROM sessions WHERE type = ? AND token_hash = ? AND expires_at > ? LIMIT 1')
    .get(type, tokenHash, nowSeconds()) as { 1: 1 } | undefined

  return !!row
}

export function deleteSession(type: SessionType, token: string | null | undefined): void {
  if (!token) return

  const db = getDb()
  const tokenHash = sha256Hex(token)
  db.prepare('DELETE FROM sessions WHERE type = ? AND token_hash = ?').run(type, tokenHash)
}

export function deleteAllSessions(type: SessionType): void {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE type = ?').run(type)
}
