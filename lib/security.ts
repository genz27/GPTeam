import crypto from 'crypto'

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(secret, salt, 32)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function isHashedSecret(stored: string): boolean {
  return stored.startsWith('scrypt$')
}

export function verifySecret(secret: string, stored: string): boolean {
  if (!stored) return false

  if (!isHashedSecret(stored)) {
    return secret === stored
  }

  const parts = stored.split('$')
  if (parts.length !== 3) return false

  const [, saltB64, hashB64] = parts
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')
  const actual = crypto.scryptSync(secret, salt, expected.length)

  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(actual, expected)
}

