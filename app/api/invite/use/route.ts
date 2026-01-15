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
    const upperCode = code.toUpperCase()
    
    // 使用事务确保一码一人，先尝试标记为已使用
    const updateResult = db.prepare(`
      UPDATE invite_codes SET used = 1, used_email = ?, used_at = datetime('now')
      WHERE code = ? AND used = 0
    `).run(email, upperCode)
    
    // 如果没有更新任何行，说明邀请码不存在或已被使用
    if (updateResult.changes === 0) {
      const invite = db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(upperCode) as any
      if (!invite) return NextResponse.json({ error: '邀请码不存在' }, { status: 404 })
      return NextResponse.json({ error: '邀请码已使用' }, { status: 409 })
    }
    
    const invite = db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(upperCode) as any

    // 确定最终使用的车位
    let finalTeamId = invite.team_account_id || (teamAccountId !== 'random' ? teamAccountId : null)
    
    // 如果没有指定车位或选择随机分配，自动选择有空位的车
    if (!finalTeamId) {
      const availableAccount = db.prepare(`
        SELECT id FROM team_accounts 
        WHERE enabled = 1 AND account_id IS NOT NULL AND account_id != ''
        AND (seats_entitled - seats_in_use - pending_invites) > 0
        ORDER BY (seats_entitled - seats_in_use - pending_invites) DESC
        LIMIT 1
      `).get() as { id: number } | undefined
      
      if (!availableAccount) {
        return NextResponse.json({ error: '没有可用的车位' }, { status: 400 })
      }
      finalTeamId = availableAccount.id
    }

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
      // 发送失败，回滚邀请码状态
      db.prepare(`
        UPDATE invite_codes SET used = 0, used_email = NULL, used_at = NULL
        WHERE code = ?
      `).run(upperCode)
      return NextResponse.json({ error: `发送邀请失败: ${result.body}` }, { status: 400 })
    }

    // 更新邀请码的车位信息
    db.prepare(`
      UPDATE invite_codes SET team_account_id = ?
      WHERE code = ?
    `).run(finalTeamId, upperCode)

    // 更新车位状态
    db.prepare('UPDATE team_accounts SET pending_invites = pending_invites + 1 WHERE id = ?').run(finalTeamId)

    return NextResponse.json({ status: 'ok', message: '邀请已发送' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
