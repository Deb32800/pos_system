import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, createSession, setSessionCookie } from '@/lib/auth'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { username, password } = body

        // Validate input
        if (!username || !password) {
            return NextResponse.json(
                { error: 'Username and password are required' },
                { status: 400 }
            )
        }

        // Find user
        const user = await db.user.findUnique({
            where: { username: username.toLowerCase() }
        })

        if (!user) {
            return NextResponse.json(
                { error: 'Invalid username or password' },
                { status: 401 }
            )
        }

        // Check if user is active
        if (!user.isActive) {
            return NextResponse.json(
                { error: 'Account has been deactivated. Please contact administrator.' },
                { status: 403 }
            )
        }

        // Verify password
        const isValidPassword = await verifyPassword(password, user.passwordHash)
        if (!isValidPassword) {
            return NextResponse.json(
                { error: 'Invalid username or password' },
                { status: 401 }
            )
        }

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

        // Check if first-run setup is needed
        const firstRunSetting = await db.setting.findUnique({
            where: { key: 'first_run_complete' }
        })
        const isFirstRun = user.role === 'ADMIN' && (!firstRunSetting || firstRunSetting.value === 'false')

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                fullName: user.fullName,
                role: user.role,
            },
            mustChangePassword: user.mustChangePassword,
            isFirstRun,
            redirectTo: user.role === 'ADMIN' ? '/admin' : '/staff'
        })
    } catch (error) {
        console.error('Login error:', error)
        return NextResponse.json(
            { error: 'Failed to sign in' },
            { status: 500 }
        )
    }
}
