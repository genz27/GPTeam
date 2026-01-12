import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/serverAuth'
import { getValidAccessToken } from '@/lib/auth'
import { post } from '@/lib/httpClient'

interface InviteItem {
  email: string
  rt: string
}

// RT 转 AT
async function rtToAt(rt: string): Promise<{ accessToken: string; newRT: string }> {
  const res = await post('https://auth.openai.com/oauth/token', {
    client_id: 'app_LlGpXReQgckcGGUo2JrYvtJK',
    grant_type: 'refresh_token',
    redirect_uri: 'com.openai.chat://auth0.openai.com/ios/com.openai.chat/callback',
    refresh_token: rt
  })
  if (!res.ok) throw new Error('RT 转 AT 失败: ' + res.text)
  return { accessToken: res.data.access_token, newRT: res.data.refresh_token || rt }
}

// 发送邀请
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

// 同意邀请
async function acceptInvite(accountId: string, userAccessToken: string) {
  const res = await post(
    `https://chatgpt.com/backend-api/accounts/${accountId}/invites/accept`,
    {},
    {
      'authorization': `Bearer ${userAccessToken}`,
      'origin': 'https://chatgpt.com',
      'referer': 'https://chatgpt.com/'
    }
  )
  return { ok: res.ok, status: res.status, body: res.text, data: res.data }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard) return guard

  const { items } = await req.json() as { items: InviteItem[] }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: '请提供邮箱和RT列表' }, { status: 400 })
  }

  const db = getDb()
  
  // 获取有空位的车账号
  const availableAccounts = db.prepare(`
    SELECT id, name, account_id, seats_entitled, seats_in_use, pending_invites 
    FROM team_accounts 
    WHERE enabled = 1 AND account_id IS NOT NULL AND account_id != ''
    ORDER BY (seats_entitled - seats_in_use - pending_invites) DESC
  `).all() as any[]

  if (availableAccounts.length === 0) {
    return NextResponse.json({ error: '没有可用的车账号' }, { status: 400 })
  }

  const results: { email: string; team: string; inviteSent: boolean; accepted: boolean; error?: string }[] = []

  for (const item of items) {
    const email = item.email?.trim()
    const userRT = item.rt?.trim()

    if (!email || !email.includes('@')) {
      results.push({ email: email || '(空)', team: '-', inviteSent: false, accepted: false, error: '无效邮箱' })
      continue
    }

    if (!userRT) {
      results.push({ email, team: '-', inviteSent: false, accepted: false, error: '缺少RT' })
      continue
    }

    // 找一个有空位的车
    const account = availableAccounts.find(a => {
      const available = a.seats_entitled - a.seats_in_use - a.pending_invites
      return available > 0
    })

    if (!account) {
      results.push({ email, team: '-', inviteSent: false, accepted: false, error: '所有车位已满' })
      continue
    }

    try {
      // 1. 获取车账号的 AT
      const teamAccessToken = await getValidAccessToken(account.id)

      // 2. 发送邀请
      const inviteResult = await sendTeamInvite(account.account_id, teamAccessToken, email)
      if (!inviteResult.ok) {
        results.push({ email, team: account.name, inviteSent: false, accepted: false, error: `发送邀请失败: ${inviteResult.body}` })
        continue
      }

      // 3. 用用户的 RT 获取 AT
      let userAccessToken: string
      try {
        const userTokenResult = await rtToAt(userRT)
        userAccessToken = userTokenResult.accessToken
      } catch (e: any) {
        results.push({ email, team: account.name, inviteSent: true, accepted: false, error: `用户RT转AT失败: ${e.message}` })
        // 更新待处理数
        account.pending_invites++
        db.prepare('UPDATE team_accounts SET pending_invites = pending_invites + 1 WHERE id = ?').run(account.id)
        continue
      }

      // 4. 同意邀请
      const acceptResult = await acceptInvite(account.account_id, userAccessToken)
      if (acceptResult.ok && acceptResult.data?.success) {
        results.push({ email, team: account.name, inviteSent: true, accepted: true })
        // 更新已用席位
        account.seats_in_use++
        db.prepare('UPDATE team_accounts SET seats_in_use = seats_in_use + 1 WHERE id = ?').run(account.id)
      } else {
        results.push({ email, team: account.name, inviteSent: true, accepted: false, error: `同意邀请失败: ${acceptResult.body}` })
        // 更新待处理数
        account.pending_invites++
        db.prepare('UPDATE team_accounts SET pending_invites = pending_invites + 1 WHERE id = ?').run(account.id)
      }
    } catch (e: any) {
      results.push({ email, team: account.name, inviteSent: false, accepted: false, error: e.message })
    }
  }

  const successCount = results.filter(r => r.accepted).length
  const partialCount = results.filter(r => r.inviteSent && !r.accepted).length
  const failCount = results.filter(r => !r.inviteSent).length

  return NextResponse.json({ results, successCount, partialCount, failCount })
}
