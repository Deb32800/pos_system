export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

type RangeKey = '7d' | '30d' | '1y' | 'custom'

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

// Format date as YYYY/MM/DD
function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
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
    const format = (searchParams.get('format') || 'csv').toLowerCase()
    const type = (searchParams.get('type') || 'transactions').toLowerCase()
    const fieldsParam = (searchParams.get('fields') || '').toLowerCase()
    const includeItems = fieldsParam.includes('items')
    const includeReturnsInTable = fieldsParam.includes('returns')

    const { from, to } = getDateRange(range, start, end)

    const sales = await db.sale.findMany({
      where: {
        createdAt: { gte: from, lte: to },
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
      orderBy: { createdAt: 'desc' },
    })

    // ALWAYS fetch returns from StockMovement for summary calculation
    const stockReturns = await db.stockMovement.findMany({
      where: {
        type: 'RETURN',
        createdAt: { gte: from, lte: to },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            sellingPrice: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Fetch cashier user info for all sales
    const cashierIds = [...new Set(sales.map((s: typeof sales[0]) => s.cashierId))]
    const users = await db.user.findMany({
      where: { id: { in: cashierIds } },
      select: { id: true, fullName: true, username: true },
    })
    const userMap = new Map<string, { id: string; fullName: string | null; username: string }>(users.map((u: typeof users[0]) => [u.id, u]))

    // Helper to create basic CSV response (for other export types)
    const toCsvResponse = (headersArr: string[], rowsArr: (string | number)[][], fileBase: string) => {
      const lines = [headersArr.map(csvEscape).join(','), ...rowsArr.map(r => r.map(csvEscape).join(','))]
      const BOM = '\uFEFF'
      const csv = BOM + lines.join('\n') + '\n'
      const fileName = `${fileBase}_${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}.csv`
      return new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${fileName}"`,
          'cache-control': 'no-store',
        },
      })
    }

    // Helper to create CSV response with report title and summary
    const toCsvResponseWithSummary = (
      reportTitle: string,
      dateRange: string,
      headersArr: string[],
      rowsArr: (string | number)[][],
      summary: { salesAmount: number; salesTax: number; grossTotal: number; returnsAmount: number; netTotal: number },
      fileBase: string,
      hasReturns: boolean
    ) => {
      const lines: string[] = []
      // Report title
      lines.push(csvEscape(reportTitle))
      lines.push(csvEscape(dateRange))
      lines.push('') // Empty line
      // Headers
      lines.push(headersArr.map(csvEscape).join(','))
      // Data rows
      for (const r of rowsArr) {
        lines.push(r.map(csvEscape).join(','))
      }
      lines.push('') // Empty line before summary
      // Summary section (right-aligned style in CSV - use empty columns)
      const emptyColsCount = headersArr.length - 2
      const emptyPrefix = Array(emptyColsCount > 0 ? emptyColsCount : 0).fill('').join(',')
      lines.push(`${emptyPrefix},Sales Amount,¥${summary.salesAmount.toFixed(1)}`)
      lines.push(`${emptyPrefix},Sales Tax (10%),¥${summary.salesTax.toFixed(1)}`)
      lines.push(`${emptyPrefix},- Returns,¥-${summary.returnsAmount.toFixed(1)}`)
      lines.push(`${emptyPrefix},[Total],¥${summary.netTotal.toFixed(1)}`)

      const BOM = '\uFEFF'
      const csv = BOM + lines.join('\n') + '\n'
      const fileName = `${fileBase}_${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}.csv`
      return new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${fileName}"`,
          'cache-control': 'no-store',
        },
      })
    }

    // Branch by export type
    if (type === 'transactions') {
      // New format headers: Sale No., Date, Time, Items Count, Amount (Cost), Tax (10%), Total
      const headers: string[] = ['Sale No.', 'Date', 'Time', 'Items Count', 'Amount', 'Tax (10%)', 'Total']
      if (includeItems) headers.push('Item Breakdown')
      if (includeReturnsInTable) headers.push('Status')

      let totalSalesAmount = 0
      let totalSalesTax = 0
      let totalSalesTotal = 0
      let totalReturnsAmount = 0

      // ALWAYS calculate total returns for summary (regardless of includeReturnsInTable)
      for (const ret of stockReturns) {
        const returnValue = ret.product.sellingPrice * ret.quantity
        const taxAmount = returnValue * 0.1
        const totalReturn = returnValue + taxAmount
        totalReturnsAmount += totalReturn
      }

      // Create combined list of sales and returns with timestamps for sorting
      type CombinedRecord = {
        type: 'sale' | 'return'
        createdAt: Date
        data: any
      }

      const combinedRecords: CombinedRecord[] = []

      // Add sales
      for (const sale of sales) {
        combinedRecords.push({
          type: 'sale',
          createdAt: new Date(sale.createdAt),
          data: sale
        })
        totalSalesAmount += sale.subtotal
        totalSalesTax += sale.taxAmount
        totalSalesTotal += sale.totalAmount
      }

      // Add returns to table only if includeReturnsInTable is enabled
      if (includeReturnsInTable) {
        for (const ret of stockReturns) {
          const returnValue = ret.product.sellingPrice * ret.quantity
          const taxAmount = returnValue * 0.1
          const totalReturn = returnValue + taxAmount

          combinedRecords.push({
            type: 'return',
            createdAt: new Date(ret.createdAt),
            data: { ...ret, returnValue, taxAmount, totalReturn }
          })
        }
      }

      // Sort by date/time descending (newest first)
      combinedRecords.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

      // Build rows for CSV
      const rows: (string | number)[][] = []
      for (const record of combinedRecords) {
        const dateObj = record.createdAt

        if (record.type === 'sale') {
          const sale = record.data
          const itemsCount = sale.saleItems.reduce((n: number, si: any) => n + si.quantity, 0)

          const rowVals: (string | number)[] = [
            sale.saleNumber,
            formatDate(dateObj),
            dateObj.toTimeString().slice(0, 5),
            itemsCount,
            `¥${sale.subtotal.toFixed(1)}`,
            `¥${sale.taxAmount.toFixed(1)}`,
            `¥${sale.totalAmount.toFixed(1)}`,
          ]

          if (includeItems) {
            const itemNames = sale.saleItems
              .map((si: any) => `${si.product?.name || 'Item'} x${si.quantity}`)
              .join(', ')
            rowVals.push(itemNames)
          }

          if (includeReturnsInTable) {
            rowVals.push('SALE')
          }

          rows.push(rowVals)
        } else {
          // Return record
          const ret = record.data

          const rowVals: (string | number)[] = [
            ret.reference || `RET-${ret.id.slice(0, 8)}`,
            formatDate(dateObj),
            dateObj.toTimeString().slice(0, 5),
            ret.quantity,
            `-¥${ret.returnValue.toFixed(1)}`,
            `-¥${ret.taxAmount.toFixed(1)}`,
            `-¥${ret.totalReturn.toFixed(1)}`,
          ]

          if (includeItems) {
            rowVals.push(`${ret.product.name} x${ret.quantity}`)
          }

          rowVals.push('★RETURN★')

          rows.push(rowVals)
        }
      }

      // Calculate totals
      const grossTotal = totalSalesTotal  // Sales + Tax (before returns)
      const netTotal = totalSalesTotal - totalReturnsAmount  // After subtracting returns

      const reportTitle = 'Sales Report'
      const dateRange = `(${formatDate(from)} - ${formatDate(to)})`

      if (format === 'json') {
        const data: Record<string, any>[] = []

        for (const record of combinedRecords) {
          const dateObj = record.createdAt

          if (record.type === 'sale') {
            const sale = record.data
            const itemsCount = sale.saleItems.reduce((n: number, si: any) => n + si.quantity, 0)

            const row: Record<string, any> = {
              'Sale No.': sale.saleNumber,
              'Date': formatDate(dateObj),
              'Time': dateObj.toTimeString().slice(0, 5),
              'Items Count': itemsCount,
              'Amount': `¥${sale.subtotal.toFixed(1)}`,
              'Tax (10%)': `¥${sale.taxAmount.toFixed(1)}`,
              'Total': `¥${sale.totalAmount.toFixed(1)}`,
            }
            if (includeItems) {
              row['Item Breakdown'] = sale.saleItems
                .map((si: any) => `${si.product?.name || 'Item'} x${si.quantity}`)
                .join(', ')
            }
            if (includeReturnsInTable) {
              row['Status'] = 'SALE'
            }
            data.push(row)
          } else {
            // Return record
            const ret = record.data

            const row: Record<string, any> = {
              'Sale No.': ret.reference || `RET-${ret.id.slice(0, 8)}`,
              'Date': formatDate(dateObj),
              'Time': dateObj.toTimeString().slice(0, 5),
              'Items Count': ret.quantity,
              'Amount': `-¥${ret.returnValue.toFixed(1)}`,
              'Tax (10%)': `-¥${ret.taxAmount.toFixed(1)}`,
              'Total': `-¥${ret.totalReturn.toFixed(1)}`,
            }
            if (includeItems) {
              row['Item Breakdown'] = `${ret.product.name} x${ret.quantity}`
            }
            row['Status'] = 'RETURN'
            data.push(row)
          }
        }

        return new Response(JSON.stringify({
          reportTitle,
          dateRange,
          headers,
          data,
          summary: {
            salesAmount: totalSalesAmount,
            salesTax: totalSalesTax,
            grossTotal: grossTotal,
            returnsAmount: totalReturnsAmount,
            netTotal: netTotal,
          }
        }), { headers: { 'content-type': 'application/json' } })
      }

      return toCsvResponseWithSummary(
        reportTitle,
        dateRange,
        headers,
        rows,
        {
          salesAmount: totalSalesAmount,
          salesTax: totalSalesTax,
          grossTotal: grossTotal,
          returnsAmount: totalReturnsAmount,
          netTotal: netTotal,
        },
        'sales_report',
        true  // Always show returns in summary
      )
    }

    if (type === 'line_items') {
      const headers = ['Sale Number', 'Date (ISO)', 'Time (24h)', 'Status', 'Product', 'SKU', 'Category', 'Qty', 'Unit Price', 'Line Total', 'Cashier']
      const rows: (string | number)[][] = []
      for (const sale of sales) {
        const d = new Date(sale.createdAt)
        const cashierName = userMap.get(sale.cashierId)?.fullName || sale.cashierId
        const status = sale.status === 'REFUNDED' ? 'returned' : String(sale.status).toLowerCase()
        for (const si of sale.saleItems) {
          rows.push([
            sale.saleNumber,
            d.toISOString().slice(0, 10),
            d.toTimeString().slice(0, 8),
            status,
            si.product?.name || 'Item',
            si.product?.sku || '',
            si.product?.category?.name || 'Uncategorized',
            si.quantity,
            si.unitPrice.toFixed(2),
            si.totalPrice.toFixed(2),
            cashierName,
          ])
        }
      }
      if (format === 'json') {
        const data = rows.slice(0, 50).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])))
        return new Response(JSON.stringify({ headers, data }), { headers: { 'content-type': 'application/json' } })
      }
      return toCsvResponse(headers, rows, 'sales_line_items')
    }

    if (type === 'payments') {
      const map = new Map<string, { count: number; total: number }>()
      for (const s of sales) {
        const key = String(s.paymentMethod).toLowerCase()
        const cur = map.get(key) || { count: 0, total: 0 }
        cur.count += 1
        cur.total += s.totalAmount
        map.set(key, cur)
      }
      const rows: (string | number)[][] = []
      const headers = ['Method', 'Sales Count', 'Total Amount', 'Avg Sale']
      Array.from(map.entries()).forEach(([method, rec]) => {
        const avg = rec.count > 0 ? rec.total / rec.count : 0
        rows.push([method, rec.count, rec.total.toFixed(2), avg.toFixed(2)])
      })
      rows.sort((a, b) => Number(b[2]) - Number(a[2]))
      if (format === 'json') {
        const data = rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])))
        return new Response(JSON.stringify({ headers, data }), { headers: { 'content-type': 'application/json' } })
      }
      return toCsvResponse(headers, rows, 'sales_by_payment_method')
    }

    if (type === 'staff') {
      const map = new Map<string, { name: string; count: number; total: number }>()
      for (const s of sales) {
        const cashierId = s.cashierId || 'unknown'
        const cashierName = userMap.get(cashierId)?.fullName || cashierId
        const cur = map.get(cashierId) || { name: cashierName, count: 0, total: 0 }
        cur.count += 1
        cur.total += s.totalAmount
        map.set(cashierId, cur)
      }
      const rows: (string | number)[][] = []
      const headers = ['Cashier', 'Sales Count', 'Total Amount', 'Avg Sale']
      Array.from(map.values()).forEach((rec) => {
        const avg = rec.count > 0 ? rec.total / rec.count : 0
        rows.push([rec.name, rec.count, rec.total.toFixed(2), avg.toFixed(2)])
      })
      rows.sort((a, b) => Number(b[2]) - Number(a[2]))
      if (format === 'json') {
        const data = rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])))
        return new Response(JSON.stringify({ headers, data }), { headers: { 'content-type': 'application/json' } })
      }
      return toCsvResponse(headers, rows, 'sales_by_staff')
    }

    if (type === 'categories') {
      const map = new Map<string, { units: number; revenue: number; cost: number }>()
      for (const s of sales) {
        for (const si of s.saleItems) {
          const cat = si.product?.category?.name || 'Uncategorized'
          const rec = map.get(cat) || { units: 0, revenue: 0, cost: 0 }
          rec.units += si.quantity
          rec.revenue += si.totalPrice
          rec.cost += si.quantity * (si.product?.costPrice || 0)
          map.set(cat, rec)
        }
      }
      const headers = ['Category', 'Units Sold', 'Revenue', 'COGS', 'Gross Profit', 'Margin %']
      const rows: (string | number)[][] = []
      Array.from(map.entries()).forEach(([cat, rec]) => {
        const gross = rec.revenue - rec.cost
        const margin = rec.revenue > 0 ? (gross / rec.revenue) * 100 : 0
        rows.push([cat, rec.units, rec.revenue.toFixed(2), rec.cost.toFixed(2), gross.toFixed(2), margin.toFixed(2)])
      })
      rows.sort((a, b) => Number(b[4]) - Number(a[4]))
      if (format === 'json') {
        const data = rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])))
        return new Response(JSON.stringify({ headers, data }), { headers: { 'content-type': 'application/json' } })
      }
      return toCsvResponse(headers, rows, 'sales_by_category')
    }

    // Default fallback to transactions
    const fallbackHeaders = ['Sale Number', 'Date', 'Time', 'Payment Method', 'Status', 'Items Count', 'Subtotal', 'Total']
    const fallbackRows: (string | number)[][] = sales.map((s: typeof sales[0]) => {
      const d = new Date(s.createdAt)
      const itemsCount = s.saleItems.reduce((n: number, si: typeof s.saleItems[0]) => n + si.quantity, 0)
      return [s.saleNumber, d.toLocaleDateString(), d.toLocaleTimeString(), String(s.paymentMethod).toLowerCase(), String(s.status).toLowerCase(), itemsCount, s.subtotal.toFixed(2), s.totalAmount.toFixed(2)]
    })
    if (format === 'json') {
      const data = fallbackRows.map(r => Object.fromEntries(fallbackHeaders.map((h, i) => [h, r[i]])))
      return new Response(JSON.stringify({ headers: fallbackHeaders, data }), { headers: { 'content-type': 'application/json' } })
    }
    return toCsvResponse(fallbackHeaders, fallbackRows, 'sales_transactions')
  } catch (error) {
    console.error('Error exporting sales:', error)
    return new Response(JSON.stringify({ error: 'Failed to export sales' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
