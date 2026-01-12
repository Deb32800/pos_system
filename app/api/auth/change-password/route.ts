import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, verifyPassword, getSessionCookie, verifySession } from '@/lib/auth'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { currentPassword, newPassword } = body

        // Validate input
        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { error: 'Current password and new password are required' },
                { status: 400 }
            )
        }

        if (newPassword.length < 6) {
            return NextResponse.json(
                { error: 'New password must be at least 6 characters' },
                { status: 400 }
            )
        }

        // Get current user from session
        const token = await getSessionCookie()
        if (!token) {
            return NextResponse.json(
                { error: 'Not authenticated' },
                { status: 401 }
            )
        }

        const sessionUser = await verifySession(token)
        if (!sessionUser) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 }
            )
        }

        // Get user from database
        const user = await db.user.findUnique({
            where: { id: sessionUser.id }
        })

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        // Verify current password
        const isValidPassword = await verifyPassword(currentPassword, user.passwordHash)
        if (!isValidPassword) {
            return NextResponse.json(
                { error: 'Current password is incorrect' },
                { status: 401 }
            )
        }

        // Hash new password and update user
        const newPasswordHash = await hashPassword(newPassword)
        await db.user.update({
            where: { id: user.id },
            data: {
                passwordHash: newPasswordHash,
                mustChangePassword: false,
            }
        })

        return NextResponse.json({
            success: true,
            message: 'Password changed successfully'
        })
    } catch (error) {
        console.error('Change password error:', error)
        return NextResponse.json(
            { error: 'Failed to change password' },
            { status: 500 }
        )
    }
}
