import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { getSetting } from '@/lib/db'
import { ACCESS_SESSION_COOKIE, ADMIN_SESSION_COOKIE, isSessionValid } from '@/lib/sessions'

export async function isAdminAuthenticated(): Promise<boolean> {
  const c = await cookies()
  const token = c.get(ADMIN_SESSION_COOKIE)?.value
  return isSessionValid('admin', token)
}

export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdminAuthenticated()) return null
  return NextResponse.json({ error: '未授权' }, { status: 401 })
}

export function isAccessKeyConfigured(): boolean {
  const accessKey = getSetting('access_key')
  return !!accessKey
}

export async function isAccessAuthenticated(): Promise<boolean> {
  if (!isAccessKeyConfigured()) return true
  const c = await cookies()
  const token = c.get(ACCESS_SESSION_COOKIE)?.value
  return isSessionValid('access', token)
}

export async function requireAccess(): Promise<NextResponse | null> {
  if (await isAccessAuthenticated()) return null
  return NextResponse.json({ error: '未授权' }, { status: 401 })
}
