import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/serverAuth'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdmin()
  if (guard) return guard

  const db = getDb()
  db.prepare('DELETE FROM invite_codes WHERE id = ?').run(params.id)
  return NextResponse.json({ status: 'deleted' })
}
