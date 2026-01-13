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

    const where: any = {
      isActive: true,
    }

    if (categoryId) {
      where.categoryId = categoryId
    }

    // Fetch all products matching base criteria
    let products = await db.product.findMany({
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
    })

    // Filter for low stock if requested (stockQuantity <= minStockLevel)
    if (lowStock === 'true') {
      products = products.filter(p => p.stockQuantity <= p.minStockLevel)
    }

    // Calculate low stock count (for all products, not just filtered)
    const allProducts = await db.product.findMany({
      where: { isActive: true, ...(categoryId ? { categoryId } : {}) },
      select: { stockQuantity: true, minStockLevel: true },
    })
    const lowStockCount = allProducts.filter(p => p.stockQuantity <= p.minStockLevel).length

    // Apply pagination
    const total = products.length
    const skip = (page - 1) * limit
    const paginatedProducts = products.slice(skip, skip + limit)

    // Calculate inventory value
    const inventoryValue = paginatedProducts.reduce((sum: number, product: typeof paginatedProducts[0]) => {
      return sum + (product.stockQuantity * product.costPrice)
    }, 0)

    const retailValue = paginatedProducts.reduce((sum: number, product: typeof paginatedProducts[0]) => {
      return sum + (product.stockQuantity * product.sellingPrice)
    }, 0)

    return NextResponse.json({
      data: paginatedProducts,
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
        lowStockCount,
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

