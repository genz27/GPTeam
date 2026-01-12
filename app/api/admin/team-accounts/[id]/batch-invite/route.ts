import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/serverAuth'
import { getValidAccessToken } from '@/lib/auth'
import { post } from '@/lib/httpClient'

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard) return guard

  const { id } = await params
  const { emails } = await req.json()

  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ error: '请提供邮箱列表' }, { status: 400 })
  }

  const db = getDb()
  const account = db.prepare('SELECT * FROM team_accounts WHERE id = ? AND enabled = 1').get(id) as any

  if (!account) {
    return NextResponse.json({ error: '账号不存在或未启用' }, { status: 404 })
  }

  if (!account.account_id) {
    return NextResponse.json({ error: '账号未配置 Account ID' }, { status: 400 })
  }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(Number(id))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }

  const results: { email: string; success: boolean; error?: string }[] = []

  for (const email of emails) {
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      results.push({ email: trimmedEmail || '(空)', success: false, error: '无效邮箱' })
      continue
    }

    try {
      const result = await sendTeamInvite(account.account_id, accessToken, trimmedEmail)
      if (result.ok) {
        results.push({ email: trimmedEmail, success: true })
        // 更新待处理数
        db.prepare('UPDATE team_accounts SET pending_invites = pending_invites + 1 WHERE id = ?').run(id)
      } else {
        results.push({ email: trimmedEmail, success: false, error: result.body })
      }
    } catch (e: any) {
      results.push({ email: trimmedEmail, success: false, error: e.message })
    }
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  return NextResponse.json({ results, successCount, failCount })
}
