'use client'
import { usePathname } from 'next/navigation'

export default function Nav() {
  const pathname = usePathname()

  const links = [
    { href: '/', label: '首页' },
    { href: '/checkout', label: 'Checkout' },
    { href: '/admin', label: '管理后台' }
  ]

  return (
    <nav style={styles.nav}>
      {links.map(link => (
        <a
          key={link.href}
          href={link.href}
          style={{
            ...styles.link,
            ...(pathname === link.href ? styles.linkActive : {})
          }}
        >
          {link.label}
        </a>
      ))}
    </nav>
  )
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    position: 'fixed',
    top: 20,
    right: 20,
    display: 'flex',
    gap: 8,
    zIndex: 100
  },
  link: {
    padding: '8px 16px',
    background: 'rgba(17, 17, 17, 0.8)',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#888',
    fontSize: 13,
    textDecoration: 'none',
    backdropFilter: 'blur(8px)'
  },
  linkActive: {
    background: '#fff',
    color: '#000',
    borderColor: '#fff'
  }
}
