'use client'
import { useState } from 'react'
import Nav from '../components/Nav'

export default function CheckoutClient() {
  const [inviteCode, setInviteCode] = useState('')
  const [verified, setVerified] = useState(false)
  const [tokenType, setTokenType] = useState<'AT' | 'RT' | 'ST'>('ST')
  const [tokens, setTokens] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<string[]>([])
  const [error, setError] = useState('')

  const verifyCode = async () => {
    if (!inviteCode.trim()) return setError('请输入邀请码')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/checkout/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim() })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '邀请码无效')
      } else {
        setVerified(true)
      }
    } catch (e: any) {
      setError('验证失败: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    const tokenList = tokens.split('\n').map(t => t.trim()).filter(Boolean)
    if (tokenList.length === 0) return setError('请输入 Token（一行一个）')
    
    setLoading(true)
    setError('')
    setResults([])
    
    const allLinks: string[] = []
    
    for (let i = 0; i < tokenList.length; i++) {
      const token = tokenList[i]
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenType, token, inviteCode: inviteCode.trim() }),
          credentials: 'include'
        })
        const data = await res.json()
        if (!res.ok) {
          allLinks.push(`#${i + 1} 失败: ${data.error || '请求失败'}`)
        } else if (data.links && data.links.length > 0) {
          allLinks.push(data.links[0])
        } else {
          allLinks.push(`#${i + 1} 失败: 无链接`)
        }
      } catch (e: any) {
        allLinks.push(`#${i + 1} 错误: ${e.message}`)
      }
      setResults([...allLinks])
    }
    
    setLoading(false)
  }

  if (!verified) {
    return (
      <div style={styles.wrapper}>
        <Nav />
        <div style={styles.gridBg} />
        <div style={styles.card}>
          <h1 style={styles.title}>TEAM CHECKOUT</h1>
          <p style={styles.subtitle}>请输入邀请码</p>

          <div style={styles.inputGroup}>
            <label style={styles.label}>邀请码</label>
            <input
              type="text"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && verifyCode()}
              placeholder="请输入邀请码"
              style={styles.input}
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button onClick={verifyCode} disabled={loading} style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}>
            {loading ? 'VERIFYING...' : 'VERIFY →'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      <Nav />
      <div style={styles.gridBg} />
      <div style={styles.card}>
        <h1 style={styles.title}>TEAM CHECKOUT</h1>
        <p style={styles.subtitle}>批量生成 Checkout 链接</p>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Token 类型</label>
          <div style={styles.typeSelector}>
            {(['AT', 'RT', 'ST'] as const).map(t => (
              <button key={t} onClick={() => setTokenType(t)} style={{ ...styles.typeBtn, ...(tokenType === t ? styles.typeBtnActive : {}) }}>{t}</button>
            ))}
          </div>
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Token（一行一个）</label>
          <textarea 
            value={tokens} 
            onChange={e => setTokens(e.target.value)} 
            placeholder={tokenType === 'RT' ? 'rt_xxx...\nrt_yyy...' : tokenType === 'ST' ? 'Session Token 1\nSession Token 2' : 'Access Token 1\nAccess Token 2'} 
            rows={6} 
            style={styles.textarea} 
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button onClick={handleGenerate} disabled={loading} style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}>
          {loading ? 'GENERATING...' : 'GENERATE →'}
        </button>

        {results.length > 0 && (
          <div style={styles.resultGroup}>
            <label style={styles.resultLabel}>CHECKOUT LINKS（一行一个）</label>
            <textarea 
              value={results.join('\n')} 
              readOnly 
              rows={Math.min(results.length + 1, 10)} 
              style={styles.textarea} 
            />
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', position: 'relative', padding: 20 },
  gridBg: { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' },
  card: { position: 'relative', background: '#111', border: '1px solid #222', borderRadius: 20, padding: '48px 40px', width: '100%', maxWidth: 500, textAlign: 'center' },
  title: { fontSize: 18, letterSpacing: 6, color: '#fff', margin: '0 0 8px', fontWeight: 500 },
  subtitle: { color: '#666', fontSize: 14, margin: '0 0 32px' },
  inputGroup: { marginBottom: 20, textAlign: 'left' },
  label: { display: 'block', color: '#666', fontSize: 11, letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  typeSelector: { display: 'flex', gap: 8 },
  typeBtn: { flex: 1, padding: '12px 16px', background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, color: '#666', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  typeBtnActive: { background: '#fff', color: '#000', borderColor: '#fff' },
  textarea: { width: '100%', background: '#0a0a0a', border: '1px solid #333', borderRadius: 12, padding: 16, color: '#fff', fontSize: 13, fontFamily: 'monospace', resize: 'none', boxSizing: 'border-box', outline: 'none' },
  input: { width: '100%', background: '#0a0a0a', border: '1px solid #333', borderRadius: 12, padding: 16, color: '#fff', fontSize: 14, boxSizing: 'border-box', outline: 'none', textAlign: 'center', letterSpacing: 2 },
  error: { color: '#f87171', fontSize: 13, marginBottom: 16 },
  btn: { width: '100%', padding: '18px 32px', background: '#fff', color: '#000', border: 'none', borderRadius: 50, fontSize: 14, fontWeight: 600, letterSpacing: 3, cursor: 'pointer' },
  btnDisabled: { background: '#333', color: '#666', cursor: 'not-allowed' },
  resultGroup: { marginTop: 24, textAlign: 'left' },
  resultLabel: { display: 'block', color: '#666', fontSize: 11, letterSpacing: 2, marginBottom: 8 }
}
