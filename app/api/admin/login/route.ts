import { NextRequest, NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/db'
import { hashSecret, isHashedSecret, verifySecret } from '@/lib/security'
import { ADMIN_SESSION_COOKIE, createSession } from '@/lib/sessions'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const adminPassword = getSetting('admin_password') || process.env.ADMIN_PASSWORD || 'admin123'
  
  if (!verifySecret(password, adminPassword)) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 })
  }

  // Upgrade legacy plaintext password stored in DB.
  if (adminPassword && !isHashedSecret(adminPassword) && adminPassword === password) {
    try {
      setSetting('admin_password', hashSecret(password))
    } catch {}
  }
  
  const res = NextResponse.json({ status: 'ok' })
  const sessionToken = createSession('admin', 86400)
  res.cookies.set(ADMIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true, 
    secure: false,
    sameSite: 'lax',
    maxAge: 86400,
    path: '/'
  })
  // Clean up legacy cookie name.
  res.cookies.delete('admin_auth')
  return res
}
