export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// GET /api/dashboard/metrics - Key metrics
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '30' // days
    const days = parseInt(period)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Previous period for comparisons
    const prevEnd = new Date(startDate)
    const prevStart = new Date(startDate)
    prevStart.setDate(prevStart.getDate() - days)

    // Get basic counts
    const [
      totalProducts,
      totalCategories,
      lowStockProducts,
      salesInRange,
      prevSales,
      inventoryProducts,
    ] = await Promise.all([
      db.product.count({ where: { isActive: true } }),
      db.category.count({ where: { isActive: true } }),
      db.product.count({
        where: {
          isActive: true,
          stockQuantity: {
            lte: db.product.fields.minStockLevel,
          },
        },
      }),
      db.sale.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'COMPLETED',
        },
        include: {
          saleItems: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  costPrice: true,
                  category: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.sale.findMany({
        where: {
          createdAt: { gte: prevStart, lte: prevEnd },
          status: 'COMPLETED',
        },
        select: {
          id: true,
          totalAmount: true,
        },
      }),
      db.product.findMany({
        where: { isActive: true },
        select: {
          stockQuantity: true,
          costPrice: true,
          sellingPrice: true,
        },
      }),
    ])

    // Get sales totals and distributions
    const salesData = {
      totalRevenue: salesInRange.reduce((s: number, v: typeof salesInRange[0]) => s + v.totalAmount, 0),
      subtotal: salesInRange.reduce((s: number, v: typeof salesInRange[0]) => s + v.subtotal, 0),
      totalDiscounts: salesInRange.reduce((s: number, v: typeof salesInRange[0]) => s + v.discountAmount, 0),
    }

    // Get sales by payment method
    const salesByPaymentMethod = await db.sale.groupBy({
      by: ['paymentMethod'],
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED',
      },
      _sum: {
        totalAmount: true,
      },
      _count: {
        id: true,
      },
    })

    // Daily sales trend
    const dayKey = (d: Date) => d.toISOString().slice(0, 10)
    const dailyMap = new Map<string, { date: string; salesCount: number; totalAmount: number }>()
    // seed all days to ensure continuity
    for (let i = 0; i <= days; i++) {
      const d = new Date(startDate)
      d.setDate(startDate.getDate() + i)
      const k = dayKey(d)
      dailyMap.set(k, { date: k, salesCount: 0, totalAmount: 0 })
    }
    for (const s of salesInRange) {
      const k = dayKey(new Date(s.createdAt))
      const cur = dailyMap.get(k)
      if (cur) {
        cur.salesCount += 1
        cur.totalAmount += s.totalAmount
      } else {
        dailyMap.set(k, { date: k, salesCount: 1, totalAmount: s.totalAmount })
      }
    }
    const dailySales = Array.from(dailyMap.values())

    // Get low stock products details
    const lowStockProductsDetails = await db.product.findMany({
      where: {
        isActive: true,
        stockQuantity: {
          lte: db.product.fields.minStockLevel,
        },
      },
      include: {
        category: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { stockQuantity: 'asc' },
      take: 10,
    })

    const totalInventoryValue = inventoryProducts.reduce(
      (sum: number, product: { stockQuantity: number, costPrice: number, sellingPrice: number }) => sum + (product.stockQuantity * product.costPrice),
      0
    )

    const totalRetailValue = inventoryProducts.reduce(
      (sum: number, product: { stockQuantity: number, costPrice: number, sellingPrice: number }) => sum + (product.stockQuantity * product.sellingPrice),
      0
    )

    // Top products aggregation
    type TopAgg = {
      productId: string
      productName: string
      sku: string
      categoryName: string
      totalQuantity: number
      totalRevenue: number
      cogs: number
      salesCount: number
    }
    const topMap = new Map<string, TopAgg>()
    for (const s of salesInRange) {
      const seen = new Set<string>()
      for (const si of s.saleItems) {
        if (!si.product) continue
        const key = si.product.id
        const prev = topMap.get(key) || {
          productId: key,
          productName: si.product.name,
          sku: si.product.sku,
          categoryName: si.product.category?.name || 'Uncategorized',
          totalQuantity: 0,
          totalRevenue: 0,
          cogs: 0,
          salesCount: 0,
        }
        prev.totalQuantity += si.quantity
        prev.totalRevenue += si.totalPrice
        prev.cogs += si.quantity * (si.product.costPrice || 0)
        // salesCount counts number of sales in which product appeared
        if (!seen.has(key)) {
          prev.salesCount += 1
          seen.add(key)
        }
        topMap.set(key, prev)
      }
    }
    const topProductsWithDetails = Array.from(topMap.values())
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 10)
      .map(tp => ({
        product: {
          id: tp.productId,
          name: tp.productName,
          sku: tp.sku,
          category: { name: tp.categoryName },
        },
        totalQuantity: tp.totalQuantity,
        totalRevenue: tp.totalRevenue,
        salesCount: tp.salesCount,
      }))

    // Sales by category
    const categoryMap = new Map<string, { category: string; totalRevenue: number; totalQuantity: number }>()
    for (const agg of Array.from(topMap.values())) {
      const cat = agg.categoryName
      const entry = categoryMap.get(cat) || { category: cat, totalRevenue: 0, totalQuantity: 0 }
      entry.totalRevenue += agg.totalRevenue
      entry.totalQuantity += agg.totalQuantity
      categoryMap.set(cat, entry)
    }
    const salesByCategory = Array.from(categoryMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)

    // Previous period comparisons
    const prevRevenue = prevSales.reduce((s: number, v: typeof prevSales[0]) => s + v.totalAmount, 0)
    const prevCount = prevSales.length
    const totalRevenue = salesData.totalRevenue || 0
    const totalSales = salesInRange.length
    const revenueChangePct = prevRevenue === 0 ? (totalRevenue > 0 ? 100 : 0) : ((totalRevenue - prevRevenue) / prevRevenue) * 100
    const salesChangePct = prevCount === 0 ? (totalSales > 0 ? 100 : 0) : ((totalSales - prevCount) / prevCount) * 100

    // Profitability
    const totalCOGS = salesInRange.reduce((sum: number, s: typeof salesInRange[0]) => sum + s.saleItems.reduce((sumI: number, si: typeof s.saleItems[0]) => sumI + si.quantity * (si.product?.costPrice || 0), 0), 0)
    const grossProfit = totalRevenue - totalCOGS
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
    const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0

    // Sales by cashier - first gather IDs
    const cashierMap = new Map<string, { cashierId: string; cashierName: string; salesCount: number; totalAmount: number }>()
    for (const s of salesInRange) {
      const key = s.cashierId || 'unknown'
      const entry = cashierMap.get(key) || { cashierId: key, cashierName: key, salesCount: 0, totalAmount: 0 }
      entry.salesCount += 1
      entry.totalAmount += s.totalAmount
      cashierMap.set(key, entry)
    }

    // Fetch cashier names
    const cashierIds = Array.from(cashierMap.keys()).filter(id => id !== 'unknown')
    const users = await db.user.findMany({
      where: { id: { in: cashierIds } },
      select: { id: true, fullName: true, username: true },
    })
    const userMap = new Map<string, string>(users.map((u: typeof users[0]) => [u.id, u.fullName || u.username]))

    // Update cashier names
    Array.from(cashierMap.entries()).forEach(([id, entry]) => {
      entry.cashierName = userMap.get(id) || id
    })

    const salesByCashier = Array.from(cashierMap.values()).sort((a, b) => b.totalAmount - a.totalAmount)

    // Peak hours (0-23)
    const peakHours = Array.from({ length: 24 }, (_, h) => ({ hour: h, salesCount: 0, totalAmount: 0 }))
    for (const s of salesInRange) {
      const h = new Date(s.createdAt).getHours()
      const entry = peakHours[h]
      entry.salesCount += 1
      entry.totalAmount += s.totalAmount
    }

    // Aggregations per product for slow/dead stock and coverage
    type ProdAgg = { id: string; name: string; sku: string; categoryName: string; soldQty: number; revenue: number }
    const prodAgg = new Map<string, ProdAgg>()
    for (const s of salesInRange) {
      for (const si of s.saleItems) {
        if (!si.product) continue
        const p = si.product
        const prev = prodAgg.get(p.id) || { id: p.id, name: p.name, sku: p.sku, categoryName: p.category?.name || 'Uncategorized', soldQty: 0, revenue: 0 }
        prev.soldQty += si.quantity
        prev.revenue += si.totalPrice
        prodAgg.set(p.id, prev)
      }
    }
    const slowMovers = Array.from(prodAgg.values()).filter(x => x.soldQty > 0).sort((a, b) => a.soldQty - b.soldQty).slice(0, 10)

    // Dead stock: active products with no sales in range and stock > 0
    const soldIds = new Set(Array.from(prodAgg.keys()))
    const deadStockProducts = await db.product.findMany({
      where: {
        isActive: true,
        id: { notIn: Array.from(soldIds) },
        stockQuantity: { gt: 0 },
      },
      select: { id: true, name: true, sku: true, stockQuantity: true, category: { select: { name: true } } },
      orderBy: { stockQuantity: 'desc' },
      take: 10,
    })

    // Inventory KPIs: turnover, GMROI, stock coverage
    const totalUnitsSold = Array.from(prodAgg.values()).reduce((n, v) => n + v.soldQty, 0)
    const avgDailyUnitsSold = days > 0 ? totalUnitsSold / days : 0
    const totalOnHandUnits = (await db.product.aggregate({ _sum: { stockQuantity: true }, where: { isActive: true } }))._sum.stockQuantity || 0
    const stockCoverageDays = avgDailyUnitsSold > 0 ? totalOnHandUnits / avgDailyUnitsSold : null
    const averageInventoryValue = totalInventoryValue // approximation without snapshots
    const inventoryTurnover = averageInventoryValue > 0 ? totalCOGS / averageInventoryValue : 0
    const gmroi = averageInventoryValue > 0 ? grossProfit / averageInventoryValue : 0

    // Coverage risks: products predicted to run out soon (< 7 days)
    const coverageRisks: Array<{ id: string; name: string; sku: string; daysLeft: number; stockQuantity: number }> = []
    const productStocks = await db.product.findMany({ where: { isActive: true }, select: { id: true, name: true, sku: true, stockQuantity: true } })
    const soldMap = new Map(Array.from(prodAgg.values()).map(v => [v.id, v.soldQty]))
    for (const p of productStocks) {
      const sold = soldMap.get(p.id) || 0
      const daily = days > 0 ? sold / days : 0
      if (daily > 0) {
        const daysLeft = p.stockQuantity / daily
        if (daysLeft < 7) coverageRisks.push({ id: p.id, name: p.name, sku: p.sku, daysLeft, stockQuantity: p.stockQuantity })
      }
    }
    coverageRisks.sort((a, b) => a.daysLeft - b.daysLeft)
    const coverageRisksTop = coverageRisks.slice(0, 10)

    // Discounts & Taxes
    const totalTaxCollected = salesInRange.reduce((s: number, v: typeof salesInRange[0]) => s + (v.taxAmount || 0), 0)
    // Sum sale-level discount + item-level discounts
    const totalSaleLevelDiscount = salesInRange.reduce((s: number, v: typeof salesInRange[0]) => s + (v.discountAmount || 0), 0)
    const totalItemLevelDiscount = salesInRange.reduce((s: number, sale: typeof salesInRange[0]) => s + sale.saleItems.reduce((ss: number, si: typeof sale.saleItems[0]) => ss + (si.discount || 0), 0), 0)
    const totalDiscountsAll = totalSaleLevelDiscount + totalItemLevelDiscount
    const averageDiscountPerOrder = totalSales > 0 ? totalDiscountsAll / totalSales : 0
    // Top discounted products by item-level discount sum
    const discAgg = new Map<string, { productId: string; name: string; sku: string; discountTotal: number }>()
    for (const s of salesInRange) {
      for (const si of s.saleItems) {
        if (!si.product) continue
        const key = si.product.id
        const prev = discAgg.get(key) || { productId: key, name: si.product.name, sku: si.product.sku, discountTotal: 0 }
        prev.discountTotal += (si.discount || 0)
        discAgg.set(key, prev)
      }
    }
    const topDiscountedProducts = Array.from(discAgg.values()).sort((a, b) => b.discountTotal - a.discountTotal).slice(0, 10)

    return NextResponse.json({
      data: {
        overview: {
          totalProducts,
          totalCategories,
          totalSales,
          lowStockCount: lowStockProducts,
          totalRevenue,
          totalDiscounts: salesData.totalDiscounts || 0,
          inventoryValue: totalInventoryValue,
          retailValue: totalRetailValue,
          averageOrderValue,
          grossProfit,
          profitMargin,
          revenueChangePct,
          salesChangePct,
          periodStart: startDate,
          periodEnd: endDate,
        },
        topProducts: topProductsWithDetails,
        salesByPaymentMethod,
        salesByCategory,
        dailySales,
        lowStockProducts: lowStockProductsDetails,
        salesByCashier,
        peakHours,
        slowMovers,
        deadStockProducts,
        inventoryKPIs: {
          inventoryTurnover,
          gmroi,
          stockCoverageDays,
        },
        coverageRisks: coverageRisksTop,
        discountsAndTaxes: {
          totalTaxCollected,
          totalDiscountsAll,
          averageDiscountPerOrder,
          topDiscountedProducts,
        },
      },
    })
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard metrics' },
      { status: 500 }
    )
  }
}

