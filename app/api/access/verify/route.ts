import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { getSetting, setSetting } from '@/lib/db'
import { hashSecret, isHashedSecret, verifySecret } from '@/lib/security'
import { ACCESS_SESSION_COOKIE, createSession, isSessionValid } from '@/lib/sessions'

// 验证访问密钥
export async function POST(req: NextRequest) {
  try {
    const accessKey = getSetting('access_key')
    
    // 如果没有设置访问密钥，直接通过
    if (!accessKey) {
      return NextResponse.json({ valid: true, required: false })
    }

    const c = await cookies()
    const existing = c.get(ACCESS_SESSION_COOKIE)?.value
    if (isSessionValid('access', existing)) {
      return NextResponse.json({ valid: true, required: true })
    }

    const { key } = await req.json()
    
    // 验证密钥
    if (!verifySecret(String(key || ''), accessKey)) {
      return NextResponse.json({ valid: false, error: '访问密钥错误' }, { status: 401 })
    }

    // Upgrade legacy plaintext access key stored in DB.
    if (accessKey && !isHashedSecret(accessKey)) {
      try {
        setSetting('access_key', hashSecret(String(key)))
      } catch {}
    }
    
    const res = NextResponse.json({ valid: true, required: true })
    const sessionToken = createSession('access', 86400 * 7)
    res.cookies.set(ACCESS_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 86400 * 7,
      path: '/'
    })
    // Clean up legacy cookie name.
    res.cookies.delete('access_verified')
    return res
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// 检查是否需要访问密钥
export async function GET() {
  const accessKey = getSetting('access_key')
  if (!accessKey) return NextResponse.json({ required: false, verified: true })

  const c = await cookies()
  const token = c.get(ACCESS_SESSION_COOKIE)?.value
  const verified = isSessionValid('access', token)
  return NextResponse.json({ required: true, verified })
}
