export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/inventory - Current stock levels
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const categoryId = searchParams.get('categoryId')
    const lowStock = searchParams.get('lowStock')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    const where: any = {
      isActive: true,
    }

    if (categoryId) {
      where.categoryId = categoryId
    }

    if (lowStock === 'true') {
      where.stockQuantity = {
        lte: db.product.fields.minStockLevel,
      }
    }

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [
          { stockQuantity: 'asc' },
          { name: 'asc' },
        ],
        skip,
        take: limit,
      }),
      db.product.count({ where }),
    ])

    // Calculate inventory value
    const inventoryValue = products.reduce((sum, product) => {
      return sum + (product.stockQuantity * product.costPrice)
    }, 0)

    const retailValue = products.reduce((sum, product) => {
      return sum + (product.stockQuantity * product.sellingPrice)
    }, 0)

    return NextResponse.json({
      data: products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      summary: {
        totalProducts: total,
        totalStockValue: inventoryValue,
        totalRetailValue: retailValue,
        lowStockCount: await db.product.count({
          where: {
            ...where,
            stockQuantity: {
              lte: db.product.fields.minStockLevel,
            },
          },
        }),
      },
    })
  } catch (error) {
    console.error('Error fetching inventory:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory' },
      { status: 500 }
    )
  }
}

