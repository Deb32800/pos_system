import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'csv'
    const range = searchParams.get('range') || '30d'
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')

    // Calculate date range
    let dateFilter = {}
    const now = new Date()
    
    if (range === 'custom' && startDate && endDate) {
      dateFilter = {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      }
    } else {
      let daysBack = 30
      if (range === '7d') daysBack = 7
      else if (range === '1y') daysBack = 365
      
      dateFilter = {
        createdAt: {
          gte: new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000)
        }
      }
    }

    // Fetch returns (stock movements with type RETURN)
    const returns = await db.stockMovement.findMany({
      where: {
        type: 'RETURN',
        ...dateFilter
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            sellingPrice: true,
            category: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Format headers and data
    const headers = [
      'Reference',
      'Date',
      'Time',
      'Product Name',
      'SKU',
      'Category',
      'Quantity',
      'Unit Price',
      'Total Value',
      'Reason',
      'Notes'
    ]

    const data = returns.map((ret: typeof returns[number]) => ({
      'Reference': ret.reference,
      'Date': new Date(ret.createdAt).toLocaleDateString(),
      'Time': new Date(ret.createdAt).toLocaleTimeString(),
      'Product Name': ret.product.name,
      'SKU': ret.product.sku,
      'Category': ret.product.category?.name || 'Uncategorized',
      'Quantity': ret.quantity,
      'Unit Price': `$${ret.product.sellingPrice.toFixed(2)}`,
      'Total Value': `$${(ret.product.sellingPrice * ret.quantity).toFixed(2)}`,
      'Reason': ret.reason || '',
      'Notes': ret.notes || ''
    }))

    // For preview/JSON format
    if (format === 'json' || searchParams.get('preview') === 'true') {
      return NextResponse.json({
        headers,
        data,
        summary: {
          totalReturns: returns.length,
          totalUnits: returns.reduce((sum: number, r: typeof returns[number]) => sum + r.quantity, 0),
          totalValue: returns.reduce((sum: number, r: typeof returns[number]) => sum + (r.product.sellingPrice * r.quantity), 0)
        }
      })
    }

    // Generate CSV
    const csvRows: string[] = []
    csvRows.push(headers.map(h => `"${h}"`).join(','))
    
    for (const row of data) {
      const values = headers.map(h => {
        const val = String(row[h as keyof typeof row] ?? '')
        return `"${val.replace(/"/g, '""')}"`
      })
      csvRows.push(values.join(','))
    }

    const csv = csvRows.join('\n')
    const filename = `returns_export_${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (error) {
    console.error("Error exporting returns:", error)
    return NextResponse.json(
      { error: "Failed to export returns" },
      { status: 500 }
    )
  }
}
