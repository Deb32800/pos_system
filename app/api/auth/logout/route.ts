import { NextResponse } from 'next/server'
import { deleteSessionCookie, getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST() {
    try {
        // Update lastLogoutAt before clearing session
        const user = await getCurrentUser()
        if (user) {
            await db.user.update({
                where: { id: user.id },
                data: { lastLogoutAt: new Date() }
            })
        }
        
        await deleteSessionCookie()
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Logout error:', error)
        return NextResponse.json(
            { error: 'Failed to sign out' },
            { status: 500 }
        )
    }
}
