import { NextResponse } from 'next/server'
import { getSetting } from '@/lib/db'

// 获取公开设置（不需要认证）
export async function GET() {
  return NextResponse.json({
    site_title: getSetting('site_title') || 'Team Invite',
    site_notice: getSetting('site_notice') || ''
  })
}
