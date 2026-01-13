export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/products/low-stock - Get products with low stock
export async function GET(request: NextRequest) {
  try {
    const allProducts = await db.product.findMany({
      where: {
        isActive: true,
      },
      include: {
        category: true,
      },
      orderBy: [
        { stockQuantity: 'asc' },
        { name: 'asc' },
      ],
    })

    // Filter for low stock (stockQuantity <= minStockLevel)
    const products = allProducts.filter(p => p.stockQuantity <= p.minStockLevel)

    return NextResponse.json({ data: products })
  } catch (error) {
    console.error('Error fetching low stock products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch low stock products' },
      { status: 500 }
    )
  }
}

