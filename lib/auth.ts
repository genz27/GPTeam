import { getDb } from '@/lib/db'
import { post, get } from '@/lib/httpClient'

// RT 转 AT
export async function refreshAccessToken(rt: string): Promise<{ accessToken: string; newRT: string }> {
  const res = await post('https://auth.openai.com/oauth/token', {
    client_id: 'app_LlGpXReQgckcGGUo2JrYvtJK',
    grant_type: 'refresh_token',
    redirect_uri: 'com.openai.chat://auth0.openai.com/ios/com.openai.chat/callback',
    refresh_token: rt
  })
  if (!res.ok) throw new Error('RT 刷新失败: ' + res.text)
  return { accessToken: res.data.access_token, newRT: res.data.refresh_token || rt }
}

// ST 转 AT
export async function stToAt(st: string): Promise<string> {
  const res = await get('https://chatgpt.com/api/auth/session', {
    'Cookie': `__Secure-next-auth.session-token=${st}`,
    'Accept': 'application/json'
  })
  if (!res.ok) throw new Error('ST 转 AT 失败: ' + res.status)
  if (!res.data.accessToken) throw new Error('ST 转 AT 失败: 无 accessToken')
  return res.data.accessToken
}

// 检测 token 类型并获取 AT
export async function tokenToAt(token: string): Promise<{ accessToken: string; newRT?: string; tokenType: string }> {
  token = token.trim()
  
  if (token.startsWith('rt_')) {
    const { accessToken, newRT } = await refreshAccessToken(token)
    return { accessToken, newRT, tokenType: 'RT' }
  }
  
  if (!token.includes('.') || token.split('.').length === 2) {
    try {
      const accessToken = await stToAt(token)
      return { accessToken, tokenType: 'ST' }
    } catch {}
  }
  
  return { accessToken: token, tokenType: 'AT' }
}

// 获取 Team Account ID
export async function fetchTeamAccountId(accessToken: string): Promise<string | null> {
  const res = await get('https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27', {
    'authorization': `Bearer ${accessToken}`,
    'origin': 'https://chatgpt.com',
    'referer': 'https://chatgpt.com/'
  })

  if (!res.ok) return null
  
  const accounts = res.data.accounts || {}
  for (const [accountId, info] of Object.entries(accounts) as any) {
    if (accountId === 'default') continue
    const account = info.account
    if (account?.plan_type === 'team' && account?.is_deactivated === false && account?.account_user_role === 'account-owner') {
      return accountId
    }
  }
  
  for (const [accountId, info] of Object.entries(accounts) as any) {
    if (accountId === 'default') continue
    const account = info.account
    if (account?.plan_type === 'team' && account?.is_deactivated === false) {
      return accountId
    }
  }
  
  return null
}

// 获取车账号的有效 AT，自动刷新
export async function getValidAccessToken(accountDbId: number): Promise<string> {
  const db = getDb()
  const acc = db.prepare('SELECT * FROM team_accounts WHERE id = ?').get(accountDbId) as any
  if (!acc) throw new Error('车账号不存在')

  const rt = acc.refresh_token
  const st = acc.session_token
  const at = acc.access_token
  const atExpiry = acc.at_expiry ? new Date(acc.at_expiry).getTime() : 0
  const tokenType = acc.token_type

  if (at && atExpiry > Date.now() + 60000) {
    return at
  }

  if (tokenType === 'RT' && rt) {
    const { accessToken, newRT } = await refreshAccessToken(rt)
    const expiry = new Date(Date.now() + 3500 * 1000).toISOString()
    db.prepare('UPDATE team_accounts SET access_token = ?, refresh_token = ?, at_expiry = ? WHERE id = ?').run(accessToken, newRT, expiry, accountDbId)
    return accessToken
  }

  if (tokenType === 'ST' && st) {
    const accessToken = await stToAt(st)
    const expiry = new Date(Date.now() + 3500 * 1000).toISOString()
    db.prepare('UPDATE team_accounts SET access_token = ?, at_expiry = ? WHERE id = ?').run(accessToken, expiry, accountDbId)
    return accessToken
  }

  if (rt) {
    const { accessToken, newRT } = await refreshAccessToken(rt)
    const expiry = new Date(Date.now() + 3500 * 1000).toISOString()
    db.prepare('UPDATE team_accounts SET access_token = ?, refresh_token = ?, at_expiry = ? WHERE id = ?').run(accessToken, newRT, expiry, accountDbId)
    return accessToken
  }

  if (acc.authorization_token) {
    return acc.authorization_token.replace(/^Bearer\s+/i, '')
  }

  throw new Error('车账号未配置凭证')
}
