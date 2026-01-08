import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { getSetting } from '@/lib/db'
import { ACCESS_SESSION_COOKIE, ADMIN_SESSION_COOKIE, isSessionValid } from '@/lib/sessions'

export function isAdminAuthenticated(): boolean {
  const c = cookies()
  const token = c.get(ADMIN_SESSION_COOKIE)?.value
  return isSessionValid('admin', token)
}

export function requireAdmin(): NextResponse | null {
  if (isAdminAuthenticated()) return null
  return NextResponse.json({ error: '未授权' }, { status: 401 })
}

export function isAccessKeyConfigured(): boolean {
  const accessKey = getSetting('access_key')
  return !!accessKey
}

export function isAccessAuthenticated(): boolean {
  if (!isAccessKeyConfigured()) return true
  const c = cookies()
  const token = c.get(ACCESS_SESSION_COOKIE)?.value
  return isSessionValid('access', token)
}

export function requireAccess(): NextResponse | null {
  if (isAccessAuthenticated()) return null
  return NextResponse.json({ error: '未授权' }, { status: 401 })
}

