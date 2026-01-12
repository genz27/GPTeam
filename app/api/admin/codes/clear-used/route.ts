import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/serverAuth'

// 清除已使用的邀请码
export async function DELETE() {
  const guard = await requireAdmin()
  if (guard) return guard

  const db = getDb()
  const result = db.prepare('DELETE FROM invite_codes WHERE used = 1').run()
  
  return NextResponse.json({ 
    deleted: result.changes 
  })
}
