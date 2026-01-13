export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// GET /api/dashboard/stats - Dashboard stats for admin
export async function GET() {
    try {
        const user = await getCurrentUser()
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const [
            totalProducts,
            totalCategories,
            totalSales,
            lowStockProducts,
            recentSales,
            recentReturns,
        ] = await Promise.all([
            db.product.count({ where: { isActive: true } }),
            db.category.count({ where: { isActive: true } }),
            db.sale.count({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                    },
                    status: 'COMPLETED',
                },
            }),
            db.product.findMany({
                where: {
                    isActive: true,
                },
                include: { category: true },
            }).then(products => products.filter(p => p.stockQuantity <= p.minStockLevel).slice(0, 10)),
            db.sale.findMany({
                include: {
                    saleItems: {
                        include: { product: { select: { name: true } } },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
            }),
            db.stockMovement.findMany({
                where: { type: 'RETURN' },
                include: {
                    product: { select: { id: true, name: true, sellingPrice: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
            }),
        ])

        const salesTotal = await db.sale.aggregate({
            where: {
                createdAt: {
                    gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                },
                status: 'COMPLETED',
            },
            _sum: { totalAmount: true },
        })

        // Fetch cashier names for recent sales
        const cashierIds = [...new Set(recentSales.map((s: typeof recentSales[0]) => s.cashierId))]
        const users = await db.user.findMany({
            where: { id: { in: cashierIds } },
            select: { id: true, fullName: true, username: true },
        })
        const userMap = new Map<string, string>(users.map((u: typeof users[0]) => [u.id, u.fullName || u.username]))

        // Combine sales and returns into activity log
        const activityLog = [
            ...recentSales.map((sale: typeof recentSales[0]) => ({
                id: sale.id,
                type: 'sale' as const,
                reference: sale.saleNumber,
                amount: sale.totalAmount,
                description: `${sale.saleItems.length} item(s)`,
                createdAt: sale.createdAt,
                cashierId: sale.cashierId,
                cashierName: userMap.get(sale.cashierId) || sale.cashierId,
            })),
            ...recentReturns.map((ret: typeof recentReturns[0]) => ({
                id: ret.id,
                type: 'return' as const,
                reference: ret.reference,
                amount: ret.product.sellingPrice * ret.quantity,
                description: `${ret.product.name} (x${ret.quantity})`,
                reason: ret.reason,
                createdAt: ret.createdAt,
            })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8)

        return NextResponse.json({
            data: {
                totalProducts,
                totalCategories,
                totalSales,
                monthlySalesTotal: salesTotal._sum.totalAmount || 0,
                lowStockCount: lowStockProducts.length,
                lowStockProducts,
                recentSales,
                recentReturns,
                activityLog,
            },
        })
    } catch (error) {
        console.error('Error fetching dashboard stats:', error)
        return NextResponse.json(
            { error: 'Failed to fetch dashboard stats' },
            { status: 500 }
        )
    }
}
