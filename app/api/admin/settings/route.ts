import { NextRequest, NextResponse } from 'next/server'
import { getAllSettings, setSetting, getSetting } from '@/lib/db'
import { hashSecret, verifySecret } from '@/lib/security'
import { deleteAllSessions } from '@/lib/sessions'
import { requireAdmin } from '@/lib/serverAuth'

// 获取所有设置
export async function GET() {
  const guard = await requireAdmin()
  if (guard) return guard

  const settings = getAllSettings()
  // Do not return secrets; only return whether they are set.
  return NextResponse.json({
    settings: {
      has_access_key: !!settings.access_key,
      site_title: settings.site_title || 'Team Invite',
      site_notice: settings.site_notice || '',
      has_password: !!settings.admin_password,
      proxy_enabled: settings.proxy_enabled === '1',
      proxy_list: settings.proxy_list || ''
    }
  })
}

// 更新设置
export async function PUT(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard) return guard

  try {
    const body = await req.json()
    const { access_key, clear_access_key, site_title, site_notice, new_password, current_password, proxy_enabled, proxy_list } = body

    // 如果要修改密码，需要验证当前密码
    if (new_password) {
      const currentPwd = getSetting('admin_password') || process.env.ADMIN_PASSWORD || 'admin123'
      if (!verifySecret(String(current_password || ''), currentPwd)) {
        return NextResponse.json({ error: '当前密码错误' }, { status: 400 })
      }
      if (String(new_password).length < 4) {
        return NextResponse.json({ error: '新密码至少4位' }, { status: 400 })
      }
      setSetting('admin_password', hashSecret(String(new_password)))
      // Force re-login on all devices after password change.
      deleteAllSessions('admin')
    }

    // 更新其他设置
    if (site_title !== undefined) setSetting('site_title', String(site_title))
    if (site_notice !== undefined) setSetting('site_notice', String(site_notice))

    if (clear_access_key) {
      setSetting('access_key', '')
      deleteAllSessions('access')
    } else if (access_key !== undefined) {
      const nextKey = String(access_key || '').trim()
      if (nextKey) {
        setSetting('access_key', hashSecret(nextKey))
        deleteAllSessions('access')
      }
    }

    // 更新代理设置
    if (proxy_enabled !== undefined) setSetting('proxy_enabled', proxy_enabled ? '1' : '0')
    if (proxy_list !== undefined) setSetting('proxy_list', String(proxy_list))

    return NextResponse.json({ status: 'ok' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
