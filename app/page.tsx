'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface TeamAccount {
  id: number
  name: string
  seatsInUse: number
  seatsEntitled: number
  pendingInvites: number
}

interface SiteSettings {
  title: string
  notice: string
}

export default function HomePage() {
  const router = useRouter()

  const [needsKey, setNeedsKey] = useState<boolean | null>(null)
  const [accessKey, setAccessKey] = useState('')
  const [keyError, setKeyError] = useState('')
  const [accounts, setAccounts] = useState<TeamAccount[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<SiteSettings>({ title: 'TEAM INVITE', notice: '' })

  useEffect(() => {
    checkAccess()
  }, [])

  const getSafeNextPath = () => {
    try {
      if (typeof window === 'undefined') return null
      const next = new URLSearchParams(window.location.search).get('next') || ''
      if (!next.startsWith('/')) return null
      if (next.startsWith('//')) return null
      return next
    } catch {
      return null
    }
  }

  const checkAccess = async () => {
    try {
      const res = await fetch('/api/access/verify')
      const data = await res.json()
      if (!data.required || data.verified) {
        setNeedsKey(false)
        const nextPath = getSafeNextPath()
        if (nextPath) {
          router.replace(nextPath)
          return
        }
        loadData()
        return
      }

      setNeedsKey(true)
    } catch {
      setNeedsKey(false)
      loadData()
    }
  }

  const verifyKey = async () => {
    if (!accessKey.trim()) return setKeyError('请输入访问密钥')
    setKeyError('')
    try {
      const res = await fetch('/api/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: accessKey.trim() }),
        credentials: 'include'
      })
      const data = await res.json()
      if (res.ok && data.valid) {
        setNeedsKey(false)
        const nextPath = getSafeNextPath()
        if (nextPath) {
          router.replace(nextPath)
          return
        }
        loadData()
      } else {
        setKeyError(data.error || '访问密钥错误')
      }
    } catch {
      setKeyError('网络错误')
    }
  }

  const loadData = async () => {
    try {
      const [accRes, settingsRes] = await Promise.all([
        fetch('/api/team-accounts/status'),
        fetch('/api/settings/public')
      ])

      if (accRes.status === 401) {
        setNeedsKey(true)
        return
      }

      const accData = await accRes.json()
      setAccounts(accData.accounts || [])
      const available = accData.accounts?.find((a: TeamAccount) => a.seatsInUse + a.pendingInvites < a.seatsEntitled)
      if (available) setSelectedId(available.id)
      
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json()
        setSettings({
          title: settingsData.site_title || 'TEAM INVITE',
          notice: settingsData.site_notice || ''
        })
      }
    } catch {}
  }

  const handleSubmit = async () => {
    if (!code.trim()) return setError('请输入邀请码')
    if (!email.trim() || !email.includes('@')) return setError('请输入有效邮箱')
    if (!selectedId) return setError('请选择车位')

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/invite/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), email: email.trim(), teamAccountId: selectedId })
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess(true)
      } else {
        setError(data.error || '提交失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  // 加载中
  if (needsKey === null) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.gridBg} />
        <div style={styles.card}>
          <p style={{ color: '#666' }}>加载中...</p>
        </div>
      </div>
    )
  }

  // 需要访问密钥
  if (needsKey) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.gridBg} />
        <div style={styles.card}>
          <div style={styles.icon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 style={styles.title}>ACCESS KEY</h1>
          <p style={styles.subtitle}>请输入访问密钥</p>
          
          <div style={styles.section}>
            <input
              type="password"
              value={accessKey}
              onChange={e => setAccessKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && verifyKey()}
              placeholder="访问密钥"
              style={styles.input}
            />
          </div>

          {keyError && <p style={styles.error}>{keyError}</p>}

          <button onClick={verifyKey} style={styles.btn}>
            VERIFY →
          </button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.gridBg} />
        <div style={styles.card}>
          <div style={styles.successIcon}>✓</div>
          <h1 style={styles.title}>INVITE SENT</h1>
          <p style={styles.subtitle}>邀请已发送到</p>
          <p style={styles.email}>{email}</p>
          <p style={styles.hint}>请查收邮件完成注册</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.gridBg} />
      <div style={styles.card}>
        <div style={styles.icon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
        </div>
        <h1 style={styles.title}>{settings.title}</h1>
        <p style={styles.subtitle}>输入邀请码加入 ChatGPT Team</p>

        {settings.notice && (
          <div style={styles.notice}>{settings.notice}</div>
        )}

        <div style={styles.section}>
          <label style={styles.label}>选择车位</label>
          <select 
            value={selectedId || ''} 
            onChange={e => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            style={styles.select}
          >
            <option value="">请选择车位</option>
            {accounts.map(acc => {
              const available = acc.seatsEntitled - acc.seatsInUse - acc.pendingInvites
              const full = available <= 0
              return (
                <option key={acc.id} value={acc.id} disabled={full}>
                  {acc.name} ({available} 剩余){full ? ' - 已满' : ''}
                </option>
              )
            })}
          </select>
        </div>

        <div style={styles.section}>
          <label style={styles.label}>邀请码</label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="输入邀请码"
            style={styles.input}
          />
        </div>

        <div style={styles.section}>
          <label style={styles.label}>邮箱地址</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={styles.input}
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button onClick={handleSubmit} disabled={loading} style={{...styles.btn, ...(loading ? styles.btnDisabled : {})}}>
          {loading ? 'SENDING...' : 'JOIN TEAM →'}
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', position: 'relative', padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif' },
  gridBg: { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' },
  card: { position: 'relative', background: '#111', border: '1px solid #222', borderRadius: 20, padding: '48px 40px', width: '100%', maxWidth: 420, textAlign: 'center' },
  icon: { color: '#fff', marginBottom: 24 },
  title: { fontSize: 18, letterSpacing: 6, color: '#fff', margin: '0 0 8px', fontWeight: 500 },
  subtitle: { color: '#666', fontSize: 14, margin: '0 0 32px' },
  notice: { background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, padding: '12px 16px', marginBottom: 24, color: '#a0a0a0', fontSize: 13, textAlign: 'left' },
  section: { marginBottom: 20, textAlign: 'left' },
  label: { display: 'block', color: '#666', fontSize: 11, letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  select: { width: '100%', padding: 14, background: '#0a0a0a', border: '1px solid #333', borderRadius: 10, color: '#fff', fontSize: 14, boxSizing: 'border-box', outline: 'none', cursor: 'pointer' },
  input: { width: '100%', padding: 14, background: '#0a0a0a', border: '1px solid #333', borderRadius: 10, color: '#fff', fontSize: 14, boxSizing: 'border-box', outline: 'none' },
  error: { color: '#f87171', fontSize: 13, marginTop: -4, marginBottom: 16 },
  btn: { width: '100%', padding: 16, background: '#fff', color: '#000', border: 'none', borderRadius: 50, fontSize: 14, fontWeight: 600, letterSpacing: 2, cursor: 'pointer' },
  btnDisabled: { background: '#333', color: '#666', cursor: 'not-allowed' },
  successIcon: { width: 64, height: 64, borderRadius: '50%', background: '#14532d', color: '#86efac', fontSize: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' },
  email: { color: '#fff', fontSize: 18, fontWeight: 600, margin: '8px 0' },
  hint: { color: '#666', fontSize: 13, marginTop: 24 }
}
