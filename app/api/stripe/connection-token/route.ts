export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// POST /api/stripe/connection-token
// Creates a connection token for Stripe Terminal SDK
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get Stripe secret key from settings
        const skSetting = await db.setting.findUnique({
            where: { key: 'stripe_sk' }
        })

        if (!skSetting?.value) {
            return NextResponse.json(
                { error: 'Stripe Secret Key not configured. Go to Settings > Hardware > Payment Terminal.' },
                { status: 400 }
            )
        }

        // Check if in test mode (simulated reader)
        const simulateSetting = await db.setting.findUnique({
            where: { key: 'stripe_simulate' }
        })
        const isSimulated = simulateSetting?.value === 'true'

        // Call Stripe API to create connection token
        const stripe = require('stripe')(skSetting.value)

        const connectionToken = await stripe.terminal.connectionTokens.create()

        return NextResponse.json({
            secret: connectionToken.secret,
            simulated: isSimulated
        })
    } catch (error: any) {
        console.error('Error creating connection token:', error)

        // Handle Stripe-specific errors
        if (error.type === 'StripeAuthenticationError') {
            return NextResponse.json(
                { error: 'Invalid Stripe API key. Please check your Secret Key in Settings.' },
                { status: 401 }
            )
        }

        return NextResponse.json(
            { error: error.message || 'Failed to create connection token' },
            { status: 500 }
        )
    }
}
