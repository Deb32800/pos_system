export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'

const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  description: z.string().optional(),
  sku: z.string().min(1, 'SKU is required'),
  barcode: z.string().optional(),
  costPrice: z.number().min(0, 'Cost price must be positive'),
  sellingPrice: z.number().min(0, 'Selling price must be positive'),
  stockQuantity: z.number().int().min(0, 'Stock quantity must be non-negative'),
  minStockLevel: z.number().int().min(0, 'Minimum stock level must be non-negative'),
  maxStockLevel: z.number().int().min(0, 'Maximum stock level must be non-negative'),
  categoryId: z.string().min(1, 'Category is required'),
  imagePath: z.string().optional(),
  taxPercent: z.number().min(0).max(100).optional(),
})

// GET /api/products - List all products
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('q')
    const categoryId = searchParams.get('categoryId')
    const lowStock = searchParams.get('lowStock')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50')), 100)
    const skip = (page - 1) * limit

    const where: any = {
      isActive: true,
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
        { barcode: { contains: search } },
      ]
    }

    if (categoryId) {
      where.categoryId = categoryId
    }

    if (lowStock === 'true') {
      where.stockQuantity = { lte: db.product.fields.minStockLevel }
    }

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        include: {
          category: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.product.count({ where }),
    ])

    return NextResponse.json({
      data: products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

// POST /api/products - Create new product
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createProductSchema.parse(body)

    // Check if SKU already exists
    const existingProduct = await db.product.findUnique({
      where: { sku: validatedData.sku },
    })

    if (existingProduct) {
      return NextResponse.json(
        { error: 'Product with this SKU already exists' },
        { status: 400 }
      )
    }

    // Check if barcode already exists (if provided)
    if (validatedData.barcode) {
      const existingBarcode = await db.product.findUnique({
        where: { barcode: validatedData.barcode },
      })

      if (existingBarcode) {
        return NextResponse.json(
          { error: 'Product with this barcode already exists' },
          { status: 400 }
        )
      }
    }

    const product = await db.product.create({
      data: validatedData,
      include: {
        category: true,
      },
    })

    // Create initial stock movement
    await db.stockMovement.create({
      data: {
        productId: product.id,
        type: 'ADJUSTMENT',
        quantity: validatedData.stockQuantity,
        reason: 'Initial stock',
        notes: 'Product created with initial stock',
      },
    })

    return NextResponse.json({ data: product }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}