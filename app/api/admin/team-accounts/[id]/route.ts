import { NextRequest, NextResponse } from 'next/server'

import { refreshAccessToken, stToAt, fetchTeamAccountId } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/serverAuth'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin()
  if (guard) return guard

  const db = getDb()
  const existing = db.prepare('SELECT * FROM team_accounts WHERE id = ?').get(params.id) as any
  if (!existing) return NextResponse.json({ error: '车账号不存在' }, { status: 404 })

  const { name, maxSeats, enabled, refreshToken, accountId, tokenType } = await req.json()
  if (!name) return NextResponse.json({ error: '请输入名称' }, { status: 400 })

  const nextName = String(name)
  const nextMaxSeats = Number(maxSeats || existing.max_seats || 5)
  const nextEnabled = enabled === undefined ? !!existing.enabled : !!enabled
  const shouldAutoDetectAccountId = accountId === undefined || accountId === null || accountId === ''
  let finalAccountId = shouldAutoDetectAccountId ? (existing.account_id || null) : String(accountId)

  let accessToken: string | null = existing.access_token || null
  let finalRT: string | null = existing.refresh_token || null
  let finalST: string | null = existing.session_token || null
  let expiry: string | null = existing.at_expiry || null
  let finalTokenType: string | null = existing.token_type || null
  let autoError: string | null = null

  // If a new token is provided, update token-related fields; otherwise keep existing secrets as-is.
  const hasNewToken = typeof refreshToken === 'string' && refreshToken.trim().length > 0
  if (hasNewToken) {
    try {
      const tokenValue = refreshToken.trim()
      const tokenTypeValue = String(tokenType || 'AT')

      if (tokenTypeValue === 'RT') {
        const result = await refreshAccessToken(tokenValue)
        accessToken = result.accessToken
        finalRT = result.newRT || tokenValue
        finalST = null
      } else if (tokenTypeValue === 'ST') {
        accessToken = await stToAt(tokenValue)
        finalST = tokenValue
        finalRT = null
      } else {
        accessToken = tokenValue
        finalRT = null
        finalST = null
      }

      expiry = new Date(Date.now() + 3500 * 1000).toISOString()
      finalTokenType = tokenTypeValue

      if (shouldAutoDetectAccountId && accessToken) {
        finalAccountId = await fetchTeamAccountId(accessToken)
      }
    } catch (e: any) {
      autoError = e.message
    }
  }

  db.prepare(
    `
      UPDATE team_accounts SET 
        name = ?, 
        refresh_token = ?, 
        session_token = ?,
        access_token = ?, 
        at_expiry = ?, 
        account_id = ?, 
        max_seats = ?, 
        enabled = ?,
        token_type = ?
      WHERE id = ?
    `
  ).run(
    nextName,
    finalRT,
    finalST,
    accessToken,
    expiry,
    finalAccountId,
    nextMaxSeats,
    nextEnabled ? 1 : 0,
    finalTokenType,
    params.id
  )

  return NextResponse.json({
    status: 'ok',
    accountId: finalAccountId,
    tokenType: finalTokenType,
    autoDetected: shouldAutoDetectAccountId && !!finalAccountId,
    autoError
  })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin()
  if (guard) return guard

  const db = getDb()
  const count = db
    .prepare('SELECT COUNT(*) as c FROM invite_codes WHERE team_account_id = ?')
    .get(params.id) as any

  if (count?.c > 0) {
    return NextResponse.json({ error: '该车位下有邀请码，无法删除' }, { status: 400 })
  }

  db.prepare('DELETE FROM team_accounts WHERE id = ?').run(params.id)
  return NextResponse.json({ status: 'deleted' })
}

