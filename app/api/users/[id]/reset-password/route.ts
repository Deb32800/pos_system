import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, hashPassword } from '@/lib/auth'

interface RouteParams {
    params: Promise<{
        id: string
    }>
}

// POST /api/users/[id]/reset-password - Admin resets user password
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const admin = await requireAdmin()
        const { id } = await params
        const body = await request.json()
        const { newPassword } = body

        if (!newPassword || newPassword.length < 6) {
            return NextResponse.json(
                { error: 'New password must be at least 6 characters' },
                { status: 400 }
            )
        }

        // Hash new password
        const passwordHash = await hashPassword(newPassword)

        // Update user password
        await db.user.update({
            where: { id },
            data: { passwordHash }
        })

        return NextResponse.json({
            success: true,
            message: 'Password reset successfully'
        })
    } catch (error: any) {
        if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 403 })
        }
        console.error('Reset password error:', error)
        return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
    }
}
