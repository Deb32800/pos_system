export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// GET /api/products/returnable - Get returnable quantities for all products
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get all sold quantities grouped by product
        const soldItems = await db.saleItem.groupBy({
            by: ['productId'],
            _sum: { quantity: true }
        })

        // Get all returned quantities grouped by product
        const returnedItems = await db.stockMovement.groupBy({
            by: ['productId'],
            where: { type: 'RETURN' },
            _sum: { quantity: true }
        })

        // Build a map of productId -> maxReturnable
        const soldMap = new Map(soldItems.map(s => [s.productId, s._sum.quantity || 0]))
        const returnedMap = new Map(returnedItems.map(r => [r.productId, r._sum.quantity || 0]))

        // Calculate returnable for each product that has been sold
        const returnableData: Record<string, number> = {}
        for (const [productId, sold] of soldMap) {
            const returned = returnedMap.get(productId) || 0
            const maxReturnable = Math.max(0, sold - returned)
            returnableData[productId] = maxReturnable
        }

        return NextResponse.json({ data: returnableData })
    } catch (error) {
        console.error('Error fetching returnable quantities:', error)
        return NextResponse.json(
            { error: 'Failed to fetch returnable quantities' },
            { status: 500 }
        )
    }
}
