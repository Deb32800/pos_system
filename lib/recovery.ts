import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const SALT_ROUNDS = 10

/**
 * Generates a random 16-character recovery key in format XXXX-XXXX-XXXX-XXXX
 */
export function generateRecoveryKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let key = ''

  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) {
      key += '-'
    }
    const randomIndex = crypto.randomInt(0, chars.length)
    key += chars[randomIndex]
  }

  return key
}

/**
 * Hashes a recovery key for secure storage
 */
export async function hashRecoveryKey(key: string): Promise<string> {
  // Remove dashes before hashing
  const cleanKey = key.replace(/-/g, '')
  return bcrypt.hash(cleanKey, SALT_ROUNDS)
}

/**
 * Verifies a recovery key against its hash
 */
export async function verifyRecoveryKey(key: string, hash: string): Promise<boolean> {
  // Remove dashes before verifying
  const cleanKey = key.replace(/-/g, '')
  return bcrypt.compare(cleanKey, hash)
}
