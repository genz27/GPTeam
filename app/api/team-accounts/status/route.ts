import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAccess } from '@/lib/serverAuth'

export async function GET() {
  const guard = await requireAccess()
  if (guard) return guard

  try {
    const db = getDb()
    const accounts = db.prepare(`
      SELECT id, name, max_seats, seats_entitled, seats_in_use, pending_invites, enabled, active_until
      FROM team_accounts WHERE enabled = 1 ORDER BY id ASC
    `).all()

    return NextResponse.json({
      accounts: (accounts as any[]).map(acc => ({
        id: acc.id,
        name: acc.name,
        maxSeats: acc.max_seats,
        seatsEntitled: acc.seats_entitled,
        seatsInUse: acc.seats_in_use,
        pendingInvites: acc.pending_invites || 0,
        activeUntil: acc.active_until
      }))
    })
  } catch (e: any) {
    return NextResponse.json({ accounts: [], error: e.message })
  }
}
