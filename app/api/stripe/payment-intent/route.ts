export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// POST /api/stripe/payment-intent
// Creates a payment intent for a sale amount
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { amount, currency = 'aud' } = body

        if (!amount || amount <= 0) {
            return NextResponse.json(
                { error: 'Invalid amount' },
                { status: 400 }
            )
        }

        // Get Stripe secret key from settings
        const skSetting = await db.setting.findUnique({
            where: { key: 'stripe_sk' }
        })

        if (!skSetting?.value) {
            return NextResponse.json(
                { error: 'Stripe Secret Key not configured' },
                { status: 400 }
            )
        }

        const stripe = require('stripe')(skSetting.value)

        // Zero-decimal currencies (Stripe requires amounts in smallest unit)
        // JPY, KRW, VND etc don't have cents, so don't multiply by 100
        const zeroDecimalCurrencies = ['jpy', 'krw', 'vnd', 'bif', 'clp', 'djf', 'gnf', 'kmf', 'mga', 'pyg', 'rwf', 'ugx', 'xaf', 'xof', 'xpf']
        const currencyLower = currency.toLowerCase()
        const isZeroDecimal = zeroDecimalCurrencies.includes(currencyLower)
        const amountInSmallestUnit = isZeroDecimal ? Math.round(amount) : Math.round(amount * 100)

        // Stripe minimum amounts (in smallest unit)
        const minimumAmounts: Record<string, number> = {
            'jpy': 50,    // ¥50
            'usd': 50,    // $0.50
            'aud': 50,    // A$0.50
            'eur': 50,    // €0.50
            'gbp': 30,    // £0.30
            'hkd': 400,   // HK$4.00
        }
        const minAmount = minimumAmounts[currencyLower] || 50

        if (amountInSmallestUnit < minAmount) {
            const minDisplay = isZeroDecimal
                ? `${minAmount} ${currency.toUpperCase()}`
                : `${(minAmount / 100).toFixed(2)} ${currency.toUpperCase()}`
            return NextResponse.json(
                { error: `Minimum card payment is ${minDisplay}` },
                { status: 400 }
            )
        }

        // Create payment intent for Terminal
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInSmallestUnit,
            currency: currency,
            payment_method_types: ['card_present'],
            capture_method: 'automatic',
        })

        return NextResponse.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        })
    } catch (error: any) {
        console.error('Error creating payment intent:', error)

        if (error.type === 'StripeAuthenticationError') {
            return NextResponse.json(
                { error: 'Invalid Stripe API key' },
                { status: 401 }
            )
        }

        return NextResponse.json(
            { error: error.message || 'Failed to create payment intent' },
            { status: 500 }
        )
    }
}

// POST /api/stripe/payment-intent/capture
// Captures a payment after card is presented
export async function PUT(request: NextRequest) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { paymentIntentId } = body

        if (!paymentIntentId) {
            return NextResponse.json(
                { error: 'Payment Intent ID required' },
                { status: 400 }
            )
        }

        // Get Stripe secret key
        const skSetting = await db.setting.findUnique({
            where: { key: 'stripe_sk' }
        })

        if (!skSetting?.value) {
            return NextResponse.json(
                { error: 'Stripe Secret Key not configured' },
                { status: 400 }
            )
        }

        const stripe = require('stripe')(skSetting.value)

        // Retrieve and check payment intent status
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

        // Zero-decimal currencies - don't divide by 100
        const zeroDecimalCurrencies = ['jpy', 'krw', 'vnd', 'bif', 'clp', 'djf', 'gnf', 'kmf', 'mga', 'pyg', 'rwf', 'ugx', 'xaf', 'xof', 'xpf']
        const isZeroDecimal = zeroDecimalCurrencies.includes(paymentIntent.currency?.toLowerCase() || '')
        const displayAmount = isZeroDecimal ? paymentIntent.amount : paymentIntent.amount / 100

        return NextResponse.json({
            status: paymentIntent.status,
            amount: displayAmount,
            succeeded: paymentIntent.status === 'succeeded'
        })
    } catch (error: any) {
        console.error('Error checking payment intent:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to check payment' },
            { status: 500 }
        )
    }
}
