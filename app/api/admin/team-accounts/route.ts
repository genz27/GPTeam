import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { refreshAccessToken, stToAt, fetchTeamAccountId } from '@/lib/auth'
import { requireAdmin } from '@/lib/serverAuth'

export async function GET() {
  const guard = await requireAdmin()
  if (guard) return guard

  const db = getDb()
  const accounts = db.prepare(`
    SELECT id, name, refresh_token, session_token, token_type, account_id, max_seats, seats_entitled, seats_in_use, pending_invites, enabled, active_until, last_sync, created_at
    FROM team_accounts ORDER BY id ASC
  `).all()
  
  return NextResponse.json({
    accounts: accounts.map((acc: any) => ({
      id: acc.id,
      name: acc.name,
      hasToken: !!(acc.refresh_token || acc.session_token),
      tokenType: acc.token_type || (acc.refresh_token ? 'RT' : acc.session_token ? 'ST' : ''),
      accountId: acc.account_id || '',
      maxSeats: acc.max_seats,
      seatsEntitled: acc.seats_entitled,
      seatsInUse: acc.seats_in_use,
      pendingInvites: acc.pending_invites || 0,
      enabled: !!acc.enabled,
      activeUntil: acc.active_until,
      lastSync: acc.last_sync
    }))
  })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard) return guard

  const { name, maxSeats, refreshToken, accountId, tokenType } = await req.json()
  if (!name) return NextResponse.json({ error: '请输入名称' }, { status: 400 })
  
  let finalAccountId = accountId || null
  let accessToken = null
  let finalRT = null
  let finalST = null
  let autoError = null
  
  // 如果有 token，根据类型处理
  if (refreshToken) {
    try {
      if (tokenType === 'RT') {
        const result = await refreshAccessToken(refreshToken)
        accessToken = result.accessToken
        finalRT = result.newRT || refreshToken
      } else if (tokenType === 'ST') {
        accessToken = await stToAt(refreshToken)
        finalST = refreshToken // 保存 ST
      } else {
        // AT 直接使用
        accessToken = refreshToken
      }
      
      // 如果没有 Account ID，自动获取
      if (!accountId && accessToken) {
        finalAccountId = await fetchTeamAccountId(accessToken)
      }
    } catch (e: any) {
      autoError = e.message
    }
  }
  
  const db = getDb()
  const expiry = accessToken ? new Date(Date.now() + 3500 * 1000).toISOString() : null
  const result = db.prepare(`
    INSERT INTO team_accounts (name, refresh_token, session_token, access_token, at_expiry, account_id, max_seats, seats_entitled, token_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, finalRT, finalST, accessToken, expiry, finalAccountId, maxSeats || 5, maxSeats || 5, tokenType)
  
  return NextResponse.json({ 
    id: result.lastInsertRowid, 
    name, 
    maxSeats,
    accountId: finalAccountId,
    tokenType,
    autoDetected: !accountId && !!finalAccountId,
    autoError
  })
}
