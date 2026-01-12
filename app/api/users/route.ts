import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, hashPassword } from '@/lib/auth'

// GET /api/users - List all users (Admin only)
export async function GET() {
    try {
        await requireAdmin()

        const users = await db.user.findMany({
            select: {
                id: true,
                username: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true,
                lastLogoutAt: true,
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        return NextResponse.json({ users })
    } catch (error: any) {
        if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 403 })
        }
        console.error('Get users error:', error)
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }
}

// POST /api/users - Create new staff user (Admin only)
export async function POST(request: NextRequest) {
    try {
        await requireAdmin()

        const body = await request.json()
        const { username, password, fullName } = body

        // Validate input - email not required, role is always STAFF
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

        // Hash password
        const passwordHash = await hashPassword(password)

        // Create user - always as STAFF (only one admin allowed)
        const user = await db.user.create({
            data: {
                username: username.toLowerCase(),
                passwordHash,
                fullName,
                role: 'STAFF', // Always STAFF - system has only one admin
            },
            select: {
                id: true,
                username: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
            }
        })

        return NextResponse.json({ user }, { status: 201 })
    } catch (error: any) {
        if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 403 })
        }
        console.error('Create user error:', error)
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }
}
