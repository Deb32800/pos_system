import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, verifyPassword } from '@/lib/auth'

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser()
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { password } = body

        if (!password) {
            return NextResponse.json({ error: 'Password is required' }, { status: 400 })
        }

        // Get the user's password hash from database
        const dbUser = await db.user.findUnique({
            where: { id: user.id },
            select: { passwordHash: true },
        })

        if (!dbUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        // Verify the password
        const isValid = await verifyPassword(password, dbUser.passwordHash)

        if (!isValid) {
            return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Password verification error:', error)
        return NextResponse.json(
            { error: 'Failed to verify password' },
            { status: 500 }
        )
    }
}
