import { NextRequest, NextResponse } from 'next/server'

import { getValidAccessToken } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/serverAuth'
import { get } from '@/lib/httpClient'

async function fetchTeamStatus(accountId: string, accessToken: string) {
  const headers = {
    'authorization': `Bearer ${accessToken}`,
    'chatgpt-account-id': accountId,
    'origin': 'https://chatgpt.com',
    'referer': 'https://chatgpt.com/'
  }

  const subsRes = await get(`https://chatgpt.com/backend-api/subscriptions?account_id=${accountId}`, headers)
  if (!subsRes.ok) throw new Error('获取订阅信息失败')

  const invitesRes = await get(`https://chatgpt.com/backend-api/accounts/${accountId}/invites?offset=0&limit=1&query=`, headers)

  return {
    seatsInUse: subsRes.data.seats_in_use || 0,
    seatsEntitled: subsRes.data.seats_entitled || 0,
    pendingInvites: invitesRes.ok ? (invitesRes.data.total || 0) : 0,
    activeUntil: subsRes.data.active_until
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdmin()
  if (guard) return guard

  const db = getDb()
  const acc = db.prepare('SELECT * FROM team_accounts WHERE id = ?').get(params.id) as any
  if (!acc) return NextResponse.json({ error: '车账号不存在' }, { status: 404 })
  if (!acc.account_id) {
    return NextResponse.json({ error: '请先配置 Account ID' }, { status: 400 })
  }

  try {
    const accessToken = await getValidAccessToken(Number(params.id))
    const data = await fetchTeamStatus(acc.account_id, accessToken)

    db.prepare(
      `
        UPDATE team_accounts
        SET seats_in_use = ?, seats_entitled = ?, pending_invites = ?, active_until = ?, last_sync = datetime('now')
        WHERE id = ?
      `
    ).run(data.seatsInUse, data.seatsEntitled, data.pendingInvites, data.activeUntil, params.id)

    return NextResponse.json({ status: 'ok', ...data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

