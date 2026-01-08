import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getValidAccessToken } from '@/lib/auth'
import { requireAccess } from '@/lib/serverAuth'
import { post } from '@/lib/httpClient'

async function sendTeamInvite(accountId: string, accessToken: string, email: string) {
  const res = await post(`https://chatgpt.com/backend-api/accounts/${accountId}/invites`, 
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
  try {
    const guard = await requireAccess()
    if (guard) return guard

    const { code, email, teamAccountId } = await req.json()

    if (!code) return NextResponse.json({ error: '请输入邀请码' }, { status: 400 })
    if (!email || !email.includes('@')) return NextResponse.json({ error: '请输入有效邮箱' }, { status: 400 })

    const db = getDb()
    const invite = db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code.toUpperCase()) as any

    if (!invite) return NextResponse.json({ error: '邀请码不存在' }, { status: 404 })
    if (invite.used) return NextResponse.json({ error: '邀请码已使用' }, { status: 409 })

    const finalTeamId = invite.team_account_id || teamAccountId
    if (!finalTeamId) return NextResponse.json({ error: '请选择车位' }, { status: 400 })

    const account = db.prepare('SELECT * FROM team_accounts WHERE id = ? AND enabled = 1').get(finalTeamId) as any
    if (!account) return NextResponse.json({ error: '车位不可用' }, { status: 400 })
    if (!account.account_id) {
      return NextResponse.json({ error: '车位未配置 Account ID' }, { status: 400 })
    }

    // 获取有效的 AT（自动刷新 RT）
    let accessToken: string
    try {
      accessToken = await getValidAccessToken(finalTeamId)
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }

    // 发送邀请
    const result = await sendTeamInvite(account.account_id, accessToken, email)
    if (!result.ok) {
      return NextResponse.json({ error: `发送邀请失败: ${result.body}` }, { status: 400 })
    }

    // 标记邀请码已使用
    db.prepare(`
      UPDATE invite_codes SET used = 1, used_email = ?, used_at = datetime('now'), team_account_id = ?
      WHERE code = ?
    `).run(email, finalTeamId, code.toUpperCase())

    // 更新车位状态
    db.prepare('UPDATE team_accounts SET pending_invites = pending_invites + 1 WHERE id = ?').run(finalTeamId)

    return NextResponse.json({ status: 'ok', message: '邀请已发送' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
