import { ProxyAgent } from 'proxy-agent'
import { getSetting } from '@/lib/db'

const defaultHeaders: Record<string, string> = {
  'accept': '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

let proxyIndex = 0

// 解析代理格式，支持多种格式
function parseProxy(proxy: string): string {
  proxy = proxy.trim()
  if (!proxy) return ''
  
  // 已经是标准 URL 格式
  if (proxy.startsWith('http://') || proxy.startsWith('https://') || proxy.startsWith('socks')) {
    return proxy
  }
  
  // 格式: host:port:user:pass
  const parts = proxy.split(':')
  if (parts.length === 4) {
    const [host, port, user, pass] = parts
    return `http://${user}:${pass}@${host}:${port}`
  }
  
  // 格式: host:port
  if (parts.length === 2) {
    return `http://${proxy}`
  }
  
  return proxy
}

// 获取下一个代理
function getNextProxy(): string | null {
  try {
    const enabled = getSetting('proxy_enabled')
    if (enabled !== '1') return null
    
    const proxyList = getSetting('proxy_list') || ''
    const proxies = proxyList.split('\n').map(p => p.trim()).filter(Boolean)
    if (proxies.length === 0) return null
    
    const proxy = proxies[proxyIndex % proxies.length]
    proxyIndex++
    return parseProxy(proxy)
  } catch {
    return null
  }
}

// 创建 fetch 配置
function getFetchOptions(): { agent?: ProxyAgent } {
  const proxyUrl = getNextProxy()
  if (proxyUrl) {
    return { agent: new ProxyAgent({ getProxyForUrl: () => proxyUrl }) }
  }
  return {}
}

interface HttpResponse {
  ok: boolean
  status: number
  data: any
  text: string
}

async function parseResponse(res: Response): Promise<HttpResponse> {
  const text = await res.text()
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data, text }
}

export async function get(url: string, headers?: Record<string, string>): Promise<HttpResponse> {
  const options = getFetchOptions()
  const res = await fetch(url, {
    method: 'GET',
    headers: { ...defaultHeaders, ...headers },
    ...options
  } as any)
  return parseResponse(res)
}

export async function post(url: string, body?: any, headers?: Record<string, string>): Promise<HttpResponse> {
  const options = getFetchOptions()
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...defaultHeaders, 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    ...options
  } as any)
  return parseResponse(res)
}
