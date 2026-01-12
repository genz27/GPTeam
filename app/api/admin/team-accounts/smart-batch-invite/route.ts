import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/serverAuth'
import { getValidAccessToken } from '@/lib/auth'
import { post } from '@/lib/httpClient'

interface TeamAccount {
  id: number
  name: string
  account_id: string
  seats_entitled: number
  seats_in_use: number
  pending_invites: number
}

async function sendTeamInvite(accountId: string, accessToken: string, email: string) {
  const res = await post(
    `https://chatgpt.com/backend-api/accounts/${accountId}/invites`,
    { email_addresses: [email], role: 'standard-user', resend_emails: true },
    {
      'authorization': `Bearer ${accessToken}`,
      'chatgpt-account-id': accountId,
      'origin': 'https://chatgpt.com',
      'referer': 'https://chatgpt.com/'
    }
  )
  return { ok: res.ok, status: res.status, body: res.text }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard) return guard

  const { emails } = await req.json()

  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ error: '请提供邮箱列表' }, { status: 400 })
  }

  const db = getDb()
  
  // 获取所有启用且有空位的车账号
  const availableAccounts = db.prepare(`
    SELECT id, name, account_id, seats_entitled, seats_in_use, pending_invites 
    FROM team_accounts 
    WHERE enabled = 1 AND account_id IS NOT NULL AND account_id != ''
    ORDER BY (seats_entitled - seats_in_use - pending_invites) DESC
  `).all() as TeamAccount[]

  if (availableAccounts.length === 0) {
    return NextResponse.json({ error: '没有可用的车账号' }, { status: 400 })
  }

  const results: { email: string; team: string; success: boolean; error?: string }[] = []
  
  // 缓存 access token
  const tokenCache: Record<number, string> = {}

  for (const email of emails) {
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      results.push({ email: trimmedEmail || '(空)', team: '-', success: false, error: '无效邮箱' })
      continue
    }

    // 找一个有空位的车
    const account = availableAccounts.find(a => {
      const available = a.seats_entitled - a.seats_in_use - a.pending_invites
      return available > 0
    })

    if (!account) {
      results.push({ email: trimmedEmail, team: '-', success: false, error: '所有车位已满' })
      continue
    }

    try {
      // 获取或缓存 access token
      if (!tokenCache[account.id]) {
        tokenCache[account.id] = await getValidAccessToken(account.id)
      }
      const accessToken = tokenCache[account.id]

      const result = await sendTeamInvite(account.account_id, accessToken, trimmedEmail)
      if (result.ok) {
        results.push({ email: trimmedEmail, team: account.name, success: true })
        // 更新待处理数（内存中也更新，避免重复分配）
        account.pending_invites++
        db.prepare('UPDATE team_accounts SET pending_invites = pending_invites + 1 WHERE id = ?').run(account.id)
      } else {
        results.push({ email: trimmedEmail, team: account.name, success: false, error: result.body })
      }
    } catch (e: any) {
      results.push({ email: trimmedEmail, team: account.name, success: false, error: e.message })
    }
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  return NextResponse.json({ results, successCount, failCount })
}
