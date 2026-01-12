import { NextRequest, NextResponse } from 'next/server'
import { post, get } from '@/lib/httpClient'
import { getDb } from '@/lib/db'

// RT 转 AT
async function rtToAt(rt: string): Promise<{ accessToken: string; newRT: string }> {
  console.log('[rtToAt] 开始转换 RT -> AT')
  const res = await post('https://auth.openai.com/oauth/token', {
    client_id: 'app_LlGpXReQgckcGGUo2JrYvtJK',
    grant_type: 'refresh_token',
    redirect_uri: 'com.openai.chat://auth0.openai.com/ios/com.openai.chat/callback',
    refresh_token: rt
  })
  console.log('[rtToAt] 响应状态:', res.ok, res.status)
  if (!res.ok) throw new Error('RT 转 AT 失败: ' + res.text)
  console.log('[rtToAt] 转换成功')
  return { accessToken: res.data.access_token, newRT: res.data.refresh_token || rt }
}

// ST 转 AT
async function stToAt(st: string): Promise<string> {
  console.log('[stToAt] 开始转换 ST -> AT')
  const res = await get('https://chatgpt.com/api/auth/session', {
    'Cookie': `__Secure-next-auth.session-token=${st}`,
    'Accept': 'application/json',
    'Origin': 'https://chatgpt.com',
    'Referer': 'https://chatgpt.com/'
  })
  console.log('[stToAt] 响应状态:', res.ok, res.status)
  console.log('[stToAt] 响应内容:', JSON.stringify(res.data).substring(0, 200))
  if (!res.ok) throw new Error('ST 转 AT 失败: ' + res.text)
  if (!res.data.accessToken) throw new Error('ST 转 AT 失败: 无 accessToken')
  console.log('[stToAt] 转换成功')
  return res.data.accessToken
}

// 生成单个 checkout 链接
async function generateLink(at: string): Promise<string> {
  console.log('[generateLink] 开始生成链接')
  const headers = {
    'authorization': `Bearer ${at}`,
    'origin': 'https://chatgpt.com',
    'referer': 'https://chatgpt.com/'
  }
  const body = {
    plan_name: 'chatgptteamplan',
    team_plan_data: { workspace_name: 'Chated', price_interval: 'month', seat_quantity: 5 },
    billing_details: { country: 'SG', currency: 'USD' },
    cancel_url: 'https://chatgpt.com/?numSeats=5&selectedPlan=month&referrer=https%3A%2F%2Fauth.openai.com%2F#team-pricing-seat-selection',
    promo_campaign: { promo_campaign_id: 'team-1-month-free', is_coupon_from_query_param: false },
    checkout_ui_mode: 'redirect'
  }
  console.log('[generateLink] 请求体:', JSON.stringify(body))
  
  const res = await post('https://chatgpt.com/backend-api/payments/checkout', body, headers)
  console.log('[generateLink] 响应状态:', res.ok, res.status)
  console.log('[generateLink] 响应内容:', res.text?.substring(0, 500))
  
  if (!res.ok) {
    throw new Error(`${res.status} - ${res.text}`)
  }
  if (res.data.url) {
    return res.data.url
  } else if (res.data.checkout_session_id) {
    return `https://chatgpt.com/checkout/openai_llc/${res.data.checkout_session_id}`
  }
  throw new Error('无 url')
}

export async function POST(req: NextRequest) {
  console.log('[POST /api/generate] 收到请求')
  try {
    const { tokenType, token, inviteCode } = await req.json()
    console.log('[POST /api/generate] tokenType:', tokenType)

    // 验证邀请码
    if (!inviteCode) {
      return NextResponse.json({ error: '请输入邀请码' }, { status: 400 })
    }

    const db = getDb()
    const invite = db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(inviteCode.toUpperCase()) as any

    if (!invite) {
      return NextResponse.json({ error: '邀请码不存在' }, { status: 404 })
    }

    if (invite.used) {
      return NextResponse.json({ error: '邀请码已使用' }, { status: 409 })
    }

    let accessToken = ''
    let newRT = ''

    if (tokenType === 'RT') {
      const result = await rtToAt(token)
      accessToken = result.accessToken
      newRT = result.newRT
    } else if (tokenType === 'ST') {
      accessToken = await stToAt(token)
    } else {
      accessToken = token
    }

    console.log('[POST /api/generate] accessToken 长度:', accessToken?.length)
    const link = await generateLink(accessToken)

    // 标记邀请码已使用
    db.prepare(`
      UPDATE invite_codes SET used = 1, used_at = datetime('now')
      WHERE code = ?
    `).run(inviteCode.toUpperCase())

    console.log('[POST /api/generate] 返回结果')
    return NextResponse.json({ newRT, links: [link] })
  } catch (e: any) {
    console.log('[POST /api/generate] 错误:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
