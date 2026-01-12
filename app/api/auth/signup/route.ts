import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, createSession, setSessionCookie } from '@/lib/auth'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { username, password, fullName } = body

        // Validate input
        if (!username || !password || !fullName) {
            return NextResponse.json(
                { error: 'Username, password, and full name are required' },
                { status: 400 }
            )
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: 'Password must be at least 6 characters' },
                { status: 400 }
            )
        }

        // Check if username already exists
        const existingUsername = await db.user.findUnique({
            where: { username: username.toLowerCase() }
        })

        if (existingUsername) {
            return NextResponse.json(
                { error: 'Username already taken' },
                { status: 400 }
            )
        }

        // Check if this is the first user (they become admin)
        const userCount = await db.user.count()
        const role = userCount === 0 ? 'ADMIN' : 'STAFF'

        // Hash password
        const passwordHash = await hashPassword(password)

        // Create user
        const user = await db.user.create({
            data: {
                username: username.toLowerCase(),
                passwordHash,
                fullName,
                role,
            },
            select: {
                id: true,
                username: true,
                fullName: true,
                role: true,
            }
        })

        // Create session
        const sessionToken = await createSession({
            id: user.id,
            fullName: user.fullName,
            role: user.role as 'ADMIN' | 'STAFF',
        })

        await setSessionCookie(sessionToken)

        // Update last login
        await db.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
        })

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.fullName,
                role: user.role,
            },
            isFirstUser: userCount === 0,
            redirectTo: role === 'ADMIN' ? '/admin' : '/staff'
        })
    } catch (error) {
        console.error('Signup error:', error)
        return NextResponse.json(
            { error: 'Failed to create account' },
            { status: 500 }
        )
    }
}
