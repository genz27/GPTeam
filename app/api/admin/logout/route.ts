import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { deleteSession, ADMIN_SESSION_COOKIE } from '@/lib/sessions'

export async function POST() {
  const res = NextResponse.json({ status: 'ok' })
  const c = await cookies()
  const token = c.get(ADMIN_SESSION_COOKIE)?.value
  deleteSession('admin', token)

  // Clear cookies.
  res.cookies.delete(ADMIN_SESSION_COOKIE)
  res.cookies.delete('admin_auth')
  return res
}
