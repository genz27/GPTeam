import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/serverAuth'
import { post, get } from '@/lib/httpClient'

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

// ST 转 AT
async function stToAt(st: string): Promise<string> {
  const res = await get('https://chatgpt.com/api/auth/session', {
    'Cookie': `__Secure-next-auth.session-token=${st}`,
    'Accept': 'application/json',
    'Origin': 'https://chatgpt.com',
    'Referer': 'https://chatgpt.com/'
  })
  if (!res.ok) throw new Error('ST 转 AT 失败: ' + res.text)
  if (!res.data.accessToken) throw new Error('ST 转 AT 失败: 无 accessToken')
  return res.data.accessToken
}

// 生成 checkout 链接
async function generateCheckoutLink(at: string): Promise<string> {
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

  const res = await post('https://chatgpt.com/backend-api/payments/checkout', body, headers)
  if (!res.ok) throw new Error(`${res.status} - ${res.text}`)
  
  if (res.data.url) return res.data.url
  if (res.data.checkout_session_id) return `https://chatgpt.com/checkout/openai_llc/${res.data.checkout_session_id}`
  throw new Error('无 url')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard) return guard

  const { id } = await params
  const db = getDb()
  const account = db.prepare('SELECT * FROM team_accounts WHERE id = ?').get(id) as any

  if (!account) {
    return NextResponse.json({ error: '账号不存在' }, { status: 404 })
  }

  const tokenType = account.token_type || 'RT'
  const token = account.refresh_token || account.session_token

  if (!token) {
    return NextResponse.json({ error: '账号未配置 Token' }, { status: 400 })
  }

  try {
    let accessToken: string

    if (tokenType === 'RT') {
      const result = await rtToAt(token)
      accessToken = result.accessToken
      // 更新新的 RT
      if (result.newRT !== token) {
        db.prepare('UPDATE team_accounts SET refresh_token = ? WHERE id = ?').run(result.newRT, id)
      }
    } else if (tokenType === 'ST') {
      accessToken = await stToAt(token)
    } else {
      accessToken = token
    }

    const link = await generateCheckoutLink(accessToken)
    return NextResponse.json({ link })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
