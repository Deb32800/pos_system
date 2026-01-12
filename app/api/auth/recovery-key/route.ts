import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { verifyRecoveryKey, generateRecoveryKey, hashRecoveryKey } from '@/lib/recovery'

// GET: Check if recovery key is set up (for first-run detection)
export async function GET() {
    try {
        const recoveryKeySetting = await db.setting.findUnique({
            where: { key: 'recovery_key_hash' }
        })

        const firstRunSetting = await db.setting.findUnique({
            where: { key: 'first_run_complete' }
        })

        return NextResponse.json({
            hasRecoveryKey: !!recoveryKeySetting && !!recoveryKeySetting.value,
            isFirstRunComplete: firstRunSetting?.value === 'true'
        })
    } catch (error) {
        console.error('Recovery key check error:', error)
        return NextResponse.json(
            { error: 'Failed to check recovery key status' },
            { status: 500 }
        )
    }
}

// POST: Verify recovery key and reset admin password
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { recoveryKey, newPassword, action } = body

        // Action: generate - Generate a new recovery key (for first-run setup)
        if (action === 'generate') {
            const newKey = generateRecoveryKey()
            const keyHash = await hashRecoveryKey(newKey)

            await db.setting.upsert({
                where: { key: 'recovery_key_hash' },
                update: { value: keyHash },
                create: {
                    key: 'recovery_key_hash',
                    value: keyHash,
                    description: 'Master recovery key hash'
                }
            })

            return NextResponse.json({
                success: true,
                recoveryKey: newKey
            })
        }

        // Action: confirm - Mark first-run as complete
        if (action === 'confirm') {
            await db.setting.upsert({
                where: { key: 'first_run_complete' },
                update: { value: 'true' },
                create: {
                    key: 'first_run_complete',
                    value: 'true',
                    description: 'Whether first-run setup is complete'
                }
            })

            return NextResponse.json({
                success: true,
                message: 'First-run setup complete'
            })
        }

        // Action: reset - Verify recovery key and reset password
        if (!recoveryKey || !newPassword) {
            return NextResponse.json(
                { error: 'Recovery key and new password are required' },
                { status: 400 }
            )
        }

        if (newPassword.length < 6) {
            return NextResponse.json(
                { error: 'New password must be at least 6 characters' },
                { status: 400 }
            )
        }

        // Get stored recovery key hash
        const recoveryKeySetting = await db.setting.findUnique({
            where: { key: 'recovery_key_hash' }
        })

        if (!recoveryKeySetting || !recoveryKeySetting.value) {
            return NextResponse.json(
                { error: 'No recovery key has been set up' },
                { status: 400 }
            )
        }

        // Verify recovery key
        const isValidKey = await verifyRecoveryKey(recoveryKey, recoveryKeySetting.value)
        if (!isValidKey) {
            return NextResponse.json(
                { error: 'Invalid recovery key' },
                { status: 401 }
            )
        }

        // Find admin user
        const adminUser = await db.user.findFirst({
            where: { role: 'ADMIN' }
        })

        if (!adminUser) {
            return NextResponse.json(
                { error: 'Admin user not found' },
                { status: 404 }
            )
        }

        // Reset admin password
        const newPasswordHash = await hashPassword(newPassword)
        await db.user.update({
            where: { id: adminUser.id },
            data: {
                passwordHash: newPasswordHash,
                mustChangePassword: false,
            }
        })

        return NextResponse.json({
            success: true,
            message: 'Password reset successfully'
        })
    } catch (error) {
        console.error('Recovery key error:', error)
        return NextResponse.json(
            { error: 'Failed to process recovery key request' },
            { status: 500 }
        )
    }
}
