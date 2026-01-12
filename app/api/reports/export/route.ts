export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'
import { getCurrentUser } from '@/lib/auth'

type RangeKey = '7d' | '30d' | '1y' | 'custom'
type ReportType = 'inventory_list' | 'inventory_performance'

function getDateRange(range: RangeKey, start?: string | null, end?: string | null) {
  const now = new Date()
  let from: Date
  let to: Date
  if (range === 'custom' && start && end) {
    from = new Date(start)
    to = new Date(end)
  } else {
    to = now
    const map: Record<Exclude<RangeKey, 'custom'>, number> = { '7d': 7, '30d': 30, '1y': 365 }
    const days = map[(range as Exclude<RangeKey, 'custom'>) || '30d'] || 30
    from = new Date(now)
    from.setDate(now.getDate() - days)
  }
  // Normalize: from at 00:00:00, to at 23:59:59
  from.setHours(0, 0, 0, 0)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const range = (searchParams.get('range') as RangeKey) || '30d'
    const start = searchParams.get('start')
    const end = searchParams.get('end')
  const type = (searchParams.get('type') as ReportType) || 'inventory_list'
  const format = (searchParams.get('format') || 'xlsx').toLowerCase()

    const { from, to } = getDateRange(range, start, end)

    // Common datasets (active products and completed sales in range)
    const [products, salesInRange] = await Promise.all([
      db.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          costPrice: true,
          sellingPrice: true,
          stockQuantity: true,
          minStockLevel: true,
          barcode: true,
          category: { select: { name: true } },
        },
      }),
      db.sale.findMany({
        where: { createdAt: { gte: from, lte: to }, status: 'COMPLETED' },
        include: {
          saleItems: {
            include: {
              product: { select: { id: true, name: true, sku: true, costPrice: true, category: { select: { name: true } } } },
            },
          },
        },
      }),
    ])
    if (type === 'inventory_list') {
      // Build per-product snapshot rows, category-wise
      const rows = products
        .map(p => {
          const stockValueCost = p.stockQuantity * p.costPrice
          const stockValueRetail = p.stockQuantity * p.sellingPrice
          const stockValueRetailRounded = Number(stockValueRetail.toFixed(2))
          const status = p.stockQuantity === 0 ? 'Out of Stock' : p.stockQuantity <= p.minStockLevel ? 'Low Stock' : 'In Stock'
          return {
            Category: p.category?.name || 'Uncategorized',
            SKU: p.sku || p.id,
            'Product Name': p.name,
            Barcode: p.barcode || '',
            'Stock Qty': p.stockQuantity,
            'Reorder Level': p.minStockLevel,
            'Unit Cost': p.costPrice,
            'Retail Price': p.sellingPrice,
            'Stock Value (Cost)': stockValueCost,
            'Stock Value (Retail)': stockValueRetailRounded,
            Status: status,
          }
        })
        .sort((a, b) => (a.Category + a['Product Name']).localeCompare(b.Category + b['Product Name']))

      if (format === 'json') {
        return new Response(JSON.stringify({ type, headers: Object.keys(rows[0] || {}), data: rows.slice(0, 200) }), {
          headers: { 'content-type': 'application/json' },
        })
      }

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(rows, { header: Object.keys(rows[0] || {}) })
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory List')
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
      const fileName = `Inventory_List_${from.toISOString().slice(0,10)}_to_${to.toISOString().slice(0,10)}.xlsx`
      return new Response(buf, {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': `attachment; filename="${fileName}"`,
          'cache-control': 'no-store',
        },
      })
    }

    if (type === 'inventory_performance') {
      // In-range movements per type (used for sold/returned/purchased breakdown)
      const inRangeAgg = await db.stockMovement.groupBy({
        by: ['productId', 'type'],
        where: { createdAt: { gte: from, lte: to } },
        _sum: { quantity: true },
      })

      const perTypeMap = new Map<string, Record<string, number>>()
      const netInRangeMap = new Map<string, number>()
      for (const row of inRangeAgg) {
        const pid = row.productId
        const typeKey = String(row.type)
        const qty = (row._sum?.quantity || 0)
        const cur = perTypeMap.get(pid) || {}
        cur[typeKey] = (cur[typeKey] || 0) + qty
        perTypeMap.set(pid, cur)
        netInRangeMap.set(pid, (netInRangeMap.get(pid) || 0) + qty)
      }

      // Movements AFTER the period end to compute closing-at-period-end from current stock
      const afterAgg = await db.stockMovement.groupBy({
        by: ['productId'],
        where: { createdAt: { gt: to } },
        _sum: { quantity: true },
      })
      const netAfterMap = new Map<string, number>(afterAgg.map(a => [a.productId, a._sum.quantity || 0]))

      // Determine if PURCHASE movement type exists in the system at all
      const purchaseExists = (await db.stockMovement.count({ where: { type: 'PURCHASE' } })) > 0

      // Aggregate per-product sales for revenue/cogs/gross (from sales within range)
      const salesAgg = new Map<string, { sold: number; revenue: number; cost: number }>()
      for (const s of salesInRange) {
        for (const si of s.saleItems) {
          if (!si.product) continue
          const pid = si.product.id
          const rec = salesAgg.get(pid) || { sold: 0, revenue: 0, cost: 0 }
          rec.sold += si.quantity
          rec.revenue += si.totalPrice
          rec.cost += si.quantity * (si.product.costPrice || 0)
          salesAgg.set(pid, rec)
        }
      }

      // Build rows with robust opening/closing calculation
      const baseRows = products.map(p => {
        const t = perTypeMap.get(p.id) || {}
        const netInRange = netInRangeMap.get(p.id) || 0
        const netAfter = netAfterMap.get(p.id) || 0
        // Closing stock at end of period = current stock - movements after the period
        const closing = (p.stockQuantity || 0) - netAfter
        // Opening stock at start of period = closing - net movements within the period
        const opening = closing - netInRange
        const purchased = Math.max(0, t['PURCHASE'] || 0)
        const sold = Math.max(0, -(t['SALE'] || 0))
        const returned = Math.max(0, t['RETURN'] || 0)
        const unitCost = p.costPrice
        const stockValue = closing * unitCost
        const stockStatus = closing === 0 ? 'Out of Stock' : closing <= p.minStockLevel ? 'Low Stock' : 'In Stock'
  const sale = salesAgg.get(p.id) || { sold: 0, revenue: 0, cost: 0 }
  const grossProfit = sale.revenue - sale.cost
  const grossProfitRounded = Number(grossProfit.toFixed(2))
  const marginPct = sale.revenue > 0 ? (grossProfit / sale.revenue) * 100 : 0
        const row: Record<string, number | string> = {
          'SKU': p.sku || p.id,
          'Product Name': p.name,
          'Category': p.category?.name || 'Uncategorized',
          'Opening Stock (Units)': opening,
          'Sold (Units)': sold,
          'Returned (Units)': returned,
          'Closing Stock (Units)': closing,
          'Unit Cost': unitCost,
          'Stock Value': stockValue,
          'Reorder Level (Units)': p.minStockLevel,
          'Stock Status': stockStatus,
          'Units Sold (Period)': sale.sold,
          'Revenue': sale.revenue,
          'COGS ': sale.cost,
          'Gross Profit': grossProfitRounded,
          'Gross Margin (%)': Number(marginPct.toFixed(2)),
        }
        // Include Purchased only if system actually tracks purchases
        if (purchaseExists) {
          row['Purchased (Units)'] = purchased
        }
        return row
      })

      // Determine headers dynamically from first row's keys to preserve order
      const headers = Object.keys(baseRows[0] || {})
      if (format === 'json') {
        return new Response(JSON.stringify({ type, headers, data: baseRows.slice(0, 200) }), {
          headers: { 'content-type': 'application/json' },
        })
      }

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(baseRows, { header: headers })
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory Performance')
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
      const fileName = `Inventory_Performance_${from.toISOString().slice(0,10)}_to_${to.toISOString().slice(0,10)}.xlsx`
      return new Response(buf, {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': `attachment; filename="${fileName}"`,
          'cache-control': 'no-store',
        },
      })
    }
    // If an unsupported type is requested
    return new Response(JSON.stringify({ error: 'Unsupported report type. Use type=inventory_list or type=inventory_performance.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    console.error('Error exporting reports:', error)
    return new Response(JSON.stringify({ error: 'Failed to export reports' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
