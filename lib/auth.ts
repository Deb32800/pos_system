import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify, JWTPayload } from 'jose'
import { cookies } from 'next/headers'
import { db } from './db'

// JWT_SECRET is required - Electron auto-generates this, dev must set in .env
function getSecret() {
    const secret = process.env.JWT_SECRET || 'dev-only-secret-not-for-production'
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET environment variable is not set in production mode.')
    }
    return new TextEncoder().encode(secret)
}

const SALT_ROUNDS = 10
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface SessionUser {
    id: string
    fullName: string
    role: 'ADMIN' | 'STAFF'
    mustChangePassword?: boolean
}

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(
    password: string,
    hashedPassword: string
): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword)
}

export async function createSession(user: SessionUser): Promise<string> {
    const token = await new SignJWT({ user })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(getSecret())

    return token
}

export async function verifySession(token: string): Promise<SessionUser | null> {
    try {
        const verified = await jwtVerify(token, getSecret())
        return verified.payload.user as SessionUser
    } catch (error) {
        return null
    }
}

export async function setSessionCookie(token: string): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.set('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_DURATION / 1000,
        path: '/',
    })
}

export async function getSessionCookie(): Promise<string | undefined> {
    const cookieStore = await cookies()
    return cookieStore.get('session')?.value
}

export async function deleteSessionCookie(): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.delete('session')
}

export async function getCurrentUser(): Promise<SessionUser | null> {
    const token = await getSessionCookie()
    if (!token) return null

    const user = await verifySession(token)
    if (!user) return null

    // Verify user still exists and is active
    const dbUser = await db.user.findUnique({
        where: { id: user.id },
        select: { id: true, fullName: true, role: true, isActive: true }
    })

    if (!dbUser || !dbUser.isActive) {
        await deleteSessionCookie()
        return null
    }

    return {
        id: dbUser.id,
        fullName: dbUser.fullName,
        role: dbUser.role as 'ADMIN' | 'STAFF'
    }
}

export async function requireAuth(): Promise<SessionUser> {
    const user = await getCurrentUser()
    if (!user) {
        throw new Error('Unauthorized')
    }
    return user
}

export async function requireAdmin(): Promise<SessionUser> {
    const user = await requireAuth()
    if (user.role !== 'ADMIN') {
        throw new Error('Forbidden: Admin access required')
    }
    return user
}
