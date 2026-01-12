import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

interface RouteParams {
    params: Promise<{
        id: string
    }>
}

// GET /api/users/[id] - Get single user (Admin only)
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        await requireAdmin()
        const { id } = await params

        const user = await db.user.findUnique({
            where: { id },
            select: {
                id: true,
                username: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true,
            }
        })

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        return NextResponse.json({ user })
    } catch (error: any) {
        if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 403 })
        }
        console.error('Get user error:', error)
        return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
    }
}

// PATCH /api/users/[id] - Update user (Admin only)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const admin = await requireAdmin()
        const { id } = await params
        const body = await request.json()
        const { fullName, role, isActive } = body

        // Prevent admin from deactivating themselves
        if (id === admin.id && isActive === false) {
            return NextResponse.json(
                { error: 'Cannot deactivate your own account' },
                { status: 400 }
            )
        }

        // Prevent admin from changing their own role
        if (id === admin.id && role && role !== admin.role) {
            return NextResponse.json(
                { error: 'Cannot change your own role' },
                { status: 400 }
            )
        }

        const updateData: any = {}
        if (fullName) updateData.fullName = fullName
        if (role) updateData.role = role
        if (typeof isActive === 'boolean') updateData.isActive = isActive

        const user = await db.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                username: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true,
            }
        })

        return NextResponse.json({ user })
    } catch (error: any) {
        if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 403 })
        }
        console.error('Update user error:', error)
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }
}

// DELETE /api/users/[id] - Delete user (Admin only)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const admin = await requireAdmin()
        const { id } = await params

        // Prevent admin from deleting themselves
        if (id === admin.id) {
            return NextResponse.json(
                { error: 'Cannot delete your own account' },
                { status: 400 }
            )
        }

        await db.user.delete({
            where: { id }
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 403 })
        }
        console.error('Delete user error:', error)
        return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
    }
}
