import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/serverAuth'

// 导出未使用的邀请码
export async function GET() {
  const guard = await requireAdmin()
  if (guard) return guard

  const db = getDb()
  const codes = db.prepare('SELECT code FROM invite_codes WHERE used = 0 ORDER BY created_at DESC').all() as { code: string }[]
  
  return NextResponse.json({ 
    codes: codes.map(c => c.code),
    count: codes.length 
  })
}
