import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json()

    if (!code) {
      return NextResponse.json({ error: '请输入邀请码' }, { status: 400 })
    }

    const db = getDb()
    const invite = db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code.toUpperCase()) as any

    if (!invite) {
      return NextResponse.json({ error: '邀请码不存在' }, { status: 404 })
    }

    if (invite.used) {
      return NextResponse.json({ error: '邀请码已使用' }, { status: 409 })
    }

    return NextResponse.json({ valid: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
