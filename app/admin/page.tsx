'use client'
import { useState, useEffect } from 'react'

interface TeamAccount {
  id: number
  name: string
  refreshToken: string
  accountId: string
  maxSeats: number
  seatsEntitled: number
  seatsInUse: number
  pendingInvites: number
  enabled: boolean
  lastSync: string | null
  tokenType?: string
}

interface InviteCode {
  id: number
  code: string
  team_account_id: number | null
  team_name: string | null
  used: number
  used_email: string | null
  created_at: string
}

interface Settings {
  access_key: string
  site_title: string
  site_notice: string
  has_password: boolean
  proxy_enabled: boolean
  proxy_list: string
}

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [tab, setTab] = useState<'accounts' | 'codes' | 'settings'>('accounts')
  const [accounts, setAccounts] = useState<TeamAccount[]>([])
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [editingAccount, setEditingAccount] = useState<Partial<TeamAccount> | null>(null)
  const [loading, setLoading] = useState(false)
  const [codeCount, setCodeCount] = useState(1)
  const [codeTeamId, setCodeTeamId] = useState<number | ''>('')
  const [settings, setSettings] = useState<Settings>({ access_key: '', site_title: '', site_notice: '', has_password: false, proxy_enabled: false, proxy_list: '' })
  const [newAccessKey, setNewAccessKey] = useState('')
  const [newSiteTitle, setNewSiteTitle] = useState('')
  const [newSiteNotice, setNewSiteNotice] = useState('')
  const [proxyEnabled, setProxyEnabled] = useState(false)
  const [proxyList, setProxyList] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [batchInviteId, setBatchInviteId] = useState<number | null>(null)
  const [batchEmails, setBatchEmails] = useState('')
  const [batchResults, setBatchResults] = useState<{ email: string; success: boolean; error?: string }[]>([])

  useEffect(() => { checkAuth() }, [])

  const api = async (path: string, options?: RequestInit) => {
    const res = await fetch('/api/admin' + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      credentials: 'include'
    })
    return { ok: res.ok, data: await res.json() }
  }

  const checkAuth = async () => {
    const { ok } = await api('/check')
    setLoggedIn(ok)
    if (ok) loadAll()
  }

  const login = async () => {
    const { ok, data } = await api('/login', { method: 'POST', body: JSON.stringify({ password }) })
    if (ok) { setLoggedIn(true); loadAll() }
    else alert(data.error || '密码错误')
  }

  const logout = async () => {
    await api('/logout', { method: 'POST' })
    setLoggedIn(false)
  }

  const loadAll = async () => {
    const [accRes, codeRes, settingsRes] = await Promise.all([api('/team-accounts'), api('/codes'), api('/settings')])
    if (accRes.ok) setAccounts(accRes.data.accounts || [])
    if (codeRes.ok) setCodes(codeRes.data.codes || [])
    if (settingsRes.ok) {
      const s = settingsRes.data.settings
      setSettings(s)
      setNewAccessKey(s.access_key || '')
      setNewSiteTitle(s.site_title || '')
      setNewSiteNotice(s.site_notice || '')
      setProxyEnabled(s.proxy_enabled || false)
      setProxyList(s.proxy_list || '')
    }
  }

  const saveAccount = async () => {
    if (!editingAccount?.name) return alert('请输入名称')
    const method = editingAccount.id ? 'PUT' : 'POST'
    const path = editingAccount.id ? `/team-accounts/${editingAccount.id}` : '/team-accounts'
    const { ok, data } = await api(path, { method, body: JSON.stringify(editingAccount) })
    if (!ok) return alert(data.error || '保存失败')
    if (data.autoDetected) alert(`保存成功！自动获取到 Account ID: ${data.accountId}`)
    else if (data.autoError) alert(`保存成功，但自动获取 Account ID 失败: ${data.autoError}`)
    setEditingAccount(null)
    loadAll()
  }

  const deleteAccount = async (id: number) => {
    if (!confirm('确定删除？')) return
    await api(`/team-accounts/${id}`, { method: 'DELETE' })
    loadAll()
  }

  const syncAccount = async (id: number) => {
    setLoading(true)
    const { ok, data } = await api(`/team-accounts/${id}/sync`, { method: 'POST' })
    setLoading(false)
    if (ok) { alert(`同步成功！已用: ${data.seatsInUse}`); loadAll() }
    else alert(data.error || '同步失败')
  }

  const getCheckoutLink = async (id: number) => {
    setLoading(true)
    const { ok, data } = await api(`/team-accounts/${id}/checkout`, { method: 'POST' })
    setLoading(false)
    if (ok && data.link) {
      navigator.clipboard.writeText(data.link)
      alert('Checkout 链接已复制到剪贴板:\n\n' + data.link)
    } else {
      alert(data.error || '获取失败')
    }
  }

  const openBatchInvite = (id: number) => {
    setBatchInviteId(id)
    setBatchEmails('')
    setBatchResults([])
  }

  const closeBatchInvite = () => {
    setBatchInviteId(null)
    setBatchEmails('')
    setBatchResults([])
  }

  const submitBatchInvite = async () => {
    if (!batchInviteId) return
    const emails = batchEmails.split('\n').map(e => e.trim()).filter(Boolean)
    if (emails.length === 0) return alert('请输入邮箱（一行一个）')
    
    setLoading(true)
    setBatchResults([])
    const { ok, data } = await api(`/team-accounts/${batchInviteId}/batch-invite`, { 
      method: 'POST', 
      body: JSON.stringify({ emails }) 
    })
    setLoading(false)
    
    if (ok) {
      setBatchResults(data.results || [])
      alert(`批量上车完成！成功: ${data.successCount}, 失败: ${data.failCount}`)
      loadAll()
    } else {
      alert(data.error || '批量上车失败')
    }
  }

  const generateCodes = async () => {
    const { ok, data } = await api('/codes', { method: 'POST', body: JSON.stringify({ count: codeCount, teamAccountId: codeTeamId || null }) })
    if (ok) { alert(`生成 ${data.created} 个邀请码`); loadAll() }
    else alert(data.error || '生成失败')
  }

  const deleteCode = async (id: number) => {
    await api(`/codes/${id}`, { method: 'DELETE' })
    loadAll()
  }

  const exportUnusedCodes = async () => {
    const { ok, data } = await api('/codes/export')
    if (ok && data.codes?.length > 0) {
      const text = data.codes.join('\n')
      navigator.clipboard.writeText(text)
      alert(`已复制 ${data.count} 个未使用邀请码到剪贴板`)
    } else {
      alert('没有未使用的邀请码')
    }
  }

  const clearUsedCodes = async () => {
    if (!confirm('确定清除所有已使用的邀请码？')) return
    const { ok, data } = await api('/codes/clear-used', { method: 'DELETE' })
    if (ok) { alert(`已清除 ${data.deleted} 个已使用邀请码`); loadAll() }
    else alert('清除失败')
  }

  const saveSettings = async () => {
    const { ok, data } = await api('/settings', { method: 'PUT', body: JSON.stringify({ access_key: newAccessKey, site_title: newSiteTitle, site_notice: newSiteNotice, proxy_enabled: proxyEnabled, proxy_list: proxyList }) })
    if (ok) { alert('设置已保存'); loadAll() }
    else alert(data.error || '保存失败')
  }

  const changePassword = async () => {
    if (!newPassword) return alert('请输入新密码')
    if (newPassword !== confirmPassword) return alert('两次密码不一致')
    if (newPassword.length < 4) return alert('密码至少4位')
    const { ok, data } = await api('/settings', { method: 'PUT', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) })
    if (ok) { alert('密码已修改'); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); loadAll() }
    else alert(data.error || '修改失败')
  }

  if (loggedIn === null) return <div style={styles.wrapper}><div style={styles.gridBg} /><div style={styles.card}><p style={{ color: '#666' }}>加载中...</p></div></div>

  if (!loggedIn) return (
    <div style={styles.wrapper}>
      <div style={styles.gridBg} />
      <div style={styles.card}>
        <div style={styles.icon}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg></div>
        <h1 style={styles.title}>ADMIN LOGIN</h1>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="管理密码" style={styles.input} />
        <button onClick={login} style={styles.btn}>LOGIN →</button>
      </div>
    </div>
  )

  return (
    <div style={styles.adminWrapper}>
      <div style={styles.gridBg} />
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.headerTitle}>ADMIN PANEL</h1>
          <div style={styles.headerRight}>
            <div style={styles.tabs}>
              <button onClick={() => setTab('accounts')} style={{ ...styles.tab, ...(tab === 'accounts' ? styles.tabActive : {}) }}>车账号</button>
              <button onClick={() => setTab('codes')} style={{ ...styles.tab, ...(tab === 'codes' ? styles.tabActive : {}) }}>邀请码</button>
              <button onClick={() => setTab('settings')} style={{ ...styles.tab, ...(tab === 'settings' ? styles.tabActive : {}) }}>设置</button>
            </div>
            <div style={styles.navLinks}>
              <a href="/" style={styles.navLink}>首页</a>
              <a href="/checkout" style={styles.navLink}>Checkout</a>
            </div>
            <button onClick={logout} style={styles.logoutBtn}>退出</button>
          </div>
        </div>

        {tab === 'accounts' && (
          <div>
            <div style={styles.toolbar}>
              <button onClick={() => setEditingAccount({ name: '', maxSeats: 5, enabled: true, tokenType: 'RT' })} style={styles.btn}>+ 添加车账号</button>
              <button onClick={loadAll} style={styles.ghostBtn}>刷新</button>
            </div>
            {editingAccount && (
              <div style={styles.editForm}>
                <h3 style={styles.formTitle}>{editingAccount.id ? '编辑' : '添加'}车账号</h3>
                <div style={styles.formRow}>
                  <input placeholder="名称" value={editingAccount.name || ''} onChange={e => setEditingAccount({ ...editingAccount, name: e.target.value })} style={styles.formInput} />
                  <input placeholder="最大席位" type="number" value={editingAccount.maxSeats || 5} onChange={e => setEditingAccount({ ...editingAccount, maxSeats: +e.target.value })} style={{ ...styles.formInput, width: 100 }} />
                </div>
                <div style={styles.formRow}>
                  <select value={(editingAccount as any).tokenType || 'RT'} onChange={e => setEditingAccount({ ...editingAccount, tokenType: e.target.value } as any)} style={{ ...styles.select, width: 100 }}>
                    <option value="RT">RT</option><option value="AT">AT</option><option value="ST">ST</option>
                  </select>
                  <input placeholder="Token" value={editingAccount.refreshToken || ''} onChange={e => setEditingAccount({ ...editingAccount, refreshToken: e.target.value })} style={styles.formInput} />
                </div>
                <div style={styles.formRow}>
                  <input placeholder="Account ID (留空自动获取)" value={editingAccount.accountId || ''} onChange={e => setEditingAccount({ ...editingAccount, accountId: e.target.value })} style={styles.formInput} />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.checkbox}><input type="checkbox" checked={editingAccount.enabled !== false} onChange={e => setEditingAccount({ ...editingAccount, enabled: e.target.checked })} /><span>启用</span></label>
                </div>
                <div style={styles.formActions}>
                  <button onClick={() => setEditingAccount(null)} style={styles.ghostBtn}>取消</button>
                  <button onClick={saveAccount} style={styles.btn}>保存</button>
                </div>
              </div>
            )}
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>名称</th><th style={styles.th}>已用/总席位</th><th style={styles.th}>待处理</th><th style={styles.th}>状态</th><th style={styles.th}>最后同步</th><th style={styles.th}>操作</th></tr></thead>
              <tbody>
                {accounts.length === 0 ? <tr><td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#666' }}>暂无数据</td></tr> : accounts.map(acc => (
                  <tr key={acc.id}>
                    <td style={styles.td}>{acc.name}</td>
                    <td style={styles.td}>{acc.seatsInUse}/{acc.seatsEntitled}</td>
                    <td style={styles.td}>{acc.pendingInvites}</td>
                    <td style={styles.td}><span style={{ ...styles.badge, ...(acc.enabled ? styles.badgeEnabled : styles.badgeDisabled) }}>{acc.enabled ? '启用' : '禁用'}</span></td>
                    <td style={styles.td}>{acc.lastSync || '-'}</td>
                    <td style={styles.td}>
                      <button onClick={() => syncAccount(acc.id)} disabled={loading} style={styles.actionBtn}>同步</button>
                      <button onClick={() => getCheckoutLink(acc.id)} disabled={loading} style={styles.actionBtn}>Checkout</button>
                      <button onClick={() => openBatchInvite(acc.id)} disabled={loading || !acc.accountId} style={styles.actionBtn}>批量上车</button>
                      <button onClick={() => setEditingAccount(acc)} style={styles.actionBtn}>编辑</button>
                      <button onClick={() => deleteAccount(acc.id)} style={{ ...styles.actionBtn, color: '#f87171' }}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {batchInviteId && (
              <div style={styles.modal}>
                <div style={styles.modalContent}>
                  <h3 style={styles.formTitle}>批量上车 - {accounts.find(a => a.id === batchInviteId)?.name}</h3>
                  <div style={styles.formRow}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>邮箱列表（一行一个）</label>
                      <textarea 
                        value={batchEmails} 
                        onChange={e => setBatchEmails(e.target.value)} 
                        placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com" 
                        style={{ ...styles.formInput, minHeight: 150, fontFamily: 'monospace', fontSize: 12 }} 
                      />
                    </div>
                  </div>
                  {batchResults.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={styles.formLabel}>执行结果</label>
                      <div style={{ background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, padding: 12, maxHeight: 150, overflow: 'auto', fontSize: 12 }}>
                        {batchResults.map((r, i) => (
                          <div key={i} style={{ color: r.success ? '#86efac' : '#fca5a5', marginBottom: 4 }}>
                            {r.email}: {r.success ? '✓ 成功' : `✗ ${r.error}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={styles.formActions}>
                    <button onClick={closeBatchInvite} style={styles.ghostBtn}>关闭</button>
                    <button onClick={submitBatchInvite} disabled={loading} style={styles.btn}>
                      {loading ? '发送中...' : '发送邀请'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'codes' && (
          <div>
            <div style={styles.toolbar}>
              <input type="number" value={codeCount} onChange={e => setCodeCount(+e.target.value)} min={1} max={50} style={{ ...styles.formInput, width: 60 }} />
              <select value={codeTeamId} onChange={e => setCodeTeamId(e.target.value ? +e.target.value : '')} style={styles.select}>
                <option value="">不绑定车位</option>
                {accounts.filter(a => a.enabled).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button onClick={generateCodes} style={styles.btn}>生成邀请码</button>
              <button onClick={exportUnusedCodes} style={styles.ghostBtn}>导出未使用</button>
              <button onClick={clearUsedCodes} style={{ ...styles.ghostBtn, color: '#f87171', borderColor: '#7f1d1d' }}>清除已使用</button>
              <button onClick={loadAll} style={styles.ghostBtn}>刷新</button>
            </div>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>邀请码</th><th style={styles.th}>绑定车位</th><th style={styles.th}>状态</th><th style={styles.th}>使用邮箱</th><th style={styles.th}>创建时间</th><th style={styles.th}>操作</th></tr></thead>
              <tbody>
                {codes.length === 0 ? <tr><td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#666' }}>暂无数据</td></tr> : codes.map(code => (
                  <tr key={code.id}>
                    <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: 600, letterSpacing: 1 }}>{code.code}</td>
                    <td style={styles.td}>{code.team_name || '-'}</td>
                    <td style={styles.td}><span style={{ ...styles.badge, ...(code.used ? styles.badgeUsed : styles.badgeAvailable) }}>{code.used ? '已使用' : '可用'}</span></td>
                    <td style={styles.td}>{code.used_email || '-'}</td>
                    <td style={styles.td}>{code.created_at}</td>
                    <td style={styles.td}><button onClick={() => deleteCode(code.id)} style={{ ...styles.actionBtn, color: '#f87171' }}>删除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'settings' && (
          <div>
            <div style={styles.settingsSection}>
              <h3 style={styles.sectionTitle}>网站设置</h3>
              <div style={styles.formRow}><div style={styles.formGroup}><label style={styles.formLabel}>网站标题</label><input value={newSiteTitle} onChange={e => setNewSiteTitle(e.target.value)} placeholder="Team Invite" style={styles.formInput} /></div></div>
              <div style={styles.formRow}><div style={styles.formGroup}><label style={styles.formLabel}>访问密钥（留空则不需要密钥）</label><input value={newAccessKey} onChange={e => setNewAccessKey(e.target.value)} placeholder="留空表示无需密钥" style={styles.formInput} /></div></div>
              <div style={styles.formRow}><div style={styles.formGroup}><label style={styles.formLabel}>公告信息</label><textarea value={newSiteNotice} onChange={e => setNewSiteNotice(e.target.value)} placeholder="显示在首页的公告" style={{ ...styles.formInput, minHeight: 80 }} /></div></div>
              <button onClick={saveSettings} style={styles.btn}>保存设置</button>
            </div>
            <div style={styles.settingsSection}>
              <h3 style={styles.sectionTitle}>代理池设置</h3>
              <div style={styles.formRow}>
                <label style={styles.checkbox}>
                  <input type="checkbox" checked={proxyEnabled} onChange={e => setProxyEnabled(e.target.checked)} />
                  <span>启用代理</span>
                </label>
              </div>
              <div style={styles.formRow}><div style={styles.formGroup}>
                <label style={styles.formLabel}>代理列表（一行一个，支持多种格式）</label>
                <textarea value={proxyList} onChange={e => setProxyList(e.target.value)} placeholder="支持格式：&#10;host:port:user:pass&#10;http://user:pass@host:port&#10;socks5://user:pass@host:port" style={{ ...styles.formInput, minHeight: 120, fontFamily: 'monospace', fontSize: 12 }} />
              </div></div>
              <p style={{ color: '#666', fontSize: 12, margin: '8px 0 16px' }}>代理将轮询使用，用于请求 ChatGPT API</p>
              <button onClick={saveSettings} style={styles.btn}>保存代理设置</button>
            </div>
            <div style={styles.settingsSection}>
              <h3 style={styles.sectionTitle}>修改管理员密码</h3>
              <div style={styles.formRow}><div style={styles.formGroup}><label style={styles.formLabel}>当前密码</label><input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="输入当前密码" style={styles.formInput} /></div></div>
              <div style={styles.formRow}><div style={styles.formGroup}><label style={styles.formLabel}>新密码</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="输入新密码" style={styles.formInput} /></div></div>
              <div style={styles.formRow}><div style={styles.formGroup}><label style={styles.formLabel}>确认新密码</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="再次输入新密码" style={styles.formInput} /></div></div>
              <button onClick={changePassword} style={styles.btn}>修改密码</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', position: 'relative', padding: 20 },
  gridBg: { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' },
  card: { position: 'relative', background: '#111', border: '1px solid #222', borderRadius: 20, padding: '48px 40px', width: '100%', maxWidth: 400, textAlign: 'center' },
  icon: { color: '#fff', marginBottom: 24 },
  title: { fontSize: 18, letterSpacing: 6, color: '#fff', margin: '0 0 24px', fontWeight: 500 },
  input: { width: '100%', padding: 16, background: '#0a0a0a', border: '1px solid #333', borderRadius: 12, color: '#fff', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' },
  btn: { padding: '12px 24px', background: '#fff', color: '#000', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  ghostBtn: { padding: '10px 16px', background: 'transparent', border: '1px solid #333', borderRadius: 8, color: '#888', fontSize: 13, cursor: 'pointer' },
  adminWrapper: { minHeight: '100vh', background: '#0a0a0a', position: 'relative', padding: 20, color: '#fff' },
  container: { position: 'relative', maxWidth: 1000, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #222', flexWrap: 'wrap', gap: 16 },
  headerTitle: { fontSize: 16, letterSpacing: 4, fontWeight: 500, margin: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  tabs: { display: 'flex', gap: 8 },
  tab: { padding: '8px 16px', background: 'transparent', border: '1px solid #333', borderRadius: 8, color: '#666', cursor: 'pointer', fontSize: 13 },
  tabActive: { background: '#fff', color: '#000', borderColor: '#fff' },
  logoutBtn: { padding: '8px 16px', background: 'transparent', border: '1px solid #333', borderRadius: 8, color: '#888', cursor: 'pointer', fontSize: 13 },
  navLinks: { display: 'flex', gap: 8 },
  navLink: { padding: '8px 12px', background: 'transparent', border: '1px solid #333', borderRadius: 8, color: '#888', fontSize: 13, textDecoration: 'none' },
  toolbar: { display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  editForm: { background: '#111', border: '1px solid #222', borderRadius: 12, padding: 20, marginBottom: 16 },
  formTitle: { margin: '0 0 16px', fontSize: 14, color: '#888', fontWeight: 500 },
  formRow: { display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  formInput: { flex: 1, minWidth: 150, padding: '10px 12px', background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 13 },
  checkbox: { display: 'flex', alignItems: 'center', gap: 8, color: '#888', fontSize: 13 },
  formActions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 },
  select: { padding: '10px 12px', background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 13, minWidth: 120 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#111', border: '1px solid #222', borderRadius: 12, overflow: 'hidden' },
  th: { padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #222', background: '#0a0a0a', color: '#666', fontWeight: 500, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  td: { padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #222', fontSize: 13 },
  badge: { display: 'inline-block', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500 },
  badgeEnabled: { background: '#14532d', color: '#86efac' },
  badgeDisabled: { background: '#333', color: '#888' },
  badgeAvailable: { background: '#14532d', color: '#86efac' },
  badgeUsed: { background: '#7f1d1d', color: '#fca5a5' },
  actionBtn: { padding: '4px 10px', marginRight: 6, background: '#222', border: 'none', borderRadius: 6, color: '#888', fontSize: 12, cursor: 'pointer' },
  settingsSection: { background: '#111', border: '1px solid #222', borderRadius: 12, padding: 24, marginBottom: 20 },
  sectionTitle: { margin: '0 0 20px', fontSize: 14, color: '#fff', fontWeight: 500 },
  formGroup: { flex: 1, minWidth: 200 },
  formLabel: { display: 'block', color: '#888', fontSize: 12, marginBottom: 8 },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { background: '#111', border: '1px solid #222', borderRadius: 12, padding: 24, width: '100%', maxWidth: 500 }
}
