import { NextRequest, NextResponse } from 'next/server'
import { getDb, generateCode } from '@/lib/db'
import { requireAdmin } from '@/lib/serverAuth'

export async function GET() {
  const guard = requireAdmin()
  if (guard) return guard

  const db = getDb()
  const codes = db.prepare(`
    SELECT c.*, t.name as team_name
    FROM invite_codes c
    LEFT JOIN team_accounts t ON c.team_account_id = t.id
    ORDER BY c.created_at DESC
  `).all()
  return NextResponse.json({ codes })
}

export async function POST(req: NextRequest) {
  const guard = requireAdmin()
  if (guard) return guard

  const { count = 1, teamAccountId } = await req.json()
  const db = getDb()
  
  if (teamAccountId) {
    const acc = db.prepare('SELECT * FROM team_accounts WHERE id = ?').get(teamAccountId)
    if (!acc) return NextResponse.json({ error: '车位不存在' }, { status: 400 })
  }

  const codes: string[] = []
  const stmt = db.prepare('INSERT INTO invite_codes (code, team_account_id) VALUES (?, ?)')
  
  for (let i = 0; i < Math.min(count, 50); i++) {
    const code = generateCode()
    try {
      stmt.run(code, teamAccountId || null)
      codes.push(code)
    } catch {}
  }

  return NextResponse.json({ codes, created: codes.length })
}
