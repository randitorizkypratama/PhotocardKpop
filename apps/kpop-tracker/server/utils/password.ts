import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEYLEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEYLEN).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  try {
    const expected = Buffer.from(hash, 'hex')
    if (expected.length !== KEYLEN) return false
    const candidate = scryptSync(password, salt, KEYLEN)
    return timingSafeEqual(new Uint8Array(candidate), new Uint8Array(expected))
  } catch {
    return false
  }
}
