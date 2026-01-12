export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'

const updateProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').optional(),
  description: z.string().optional(),
  sku: z.string().min(1, 'SKU is required').optional(),
  barcode: z.string().optional(),
  costPrice: z.number().min(0, 'Cost price must be positive').optional(),
  sellingPrice: z.number().min(0, 'Selling price must be positive').optional(),
  stockQuantity: z.number().int().min(0, 'Stock quantity must be non-negative').optional(),
  minStockLevel: z.number().int().min(0, 'Minimum stock level must be non-negative').optional(),
  maxStockLevel: z.number().int().min(0, 'Maximum stock level must be non-negative').optional(),
  categoryId: z.string().min(1, 'Category is required').optional(),
  imagePath: z.string().optional(),
  isActive: z.boolean().optional(),
  taxPercent: z.number().min(0).max(100).optional(),
})

// GET /api/products/[id] - Get single product
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const product = await db.product.findUnique({
      where: { id: params.id },
      include: {
        category: true,
        stockMovements: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: product })
  } catch (error) {
    console.error('Error fetching product:', error)
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    )
  }
}

// PUT /api/products/[id] - Update product
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = updateProductSchema.parse(body)

    // Check if product exists
    const existingProduct = await db.product.findUnique({
      where: { id: params.id },
    })

    if (!existingProduct) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Disallow SKU changes on edit
    if (validatedData.sku && validatedData.sku !== existingProduct.sku) {
      return NextResponse.json(
        { error: 'SKU cannot be changed after creation' },
        { status: 400 }
      )
    }

    // Check if barcode already exists (if changing barcode)
    if (validatedData.barcode && validatedData.barcode !== existingProduct.barcode) {
      const barcodeExists = await db.product.findUnique({
        where: { barcode: validatedData.barcode },
      })

      if (barcodeExists) {
        return NextResponse.json(
          { error: 'Product with this barcode already exists' },
          { status: 400 }
        )
      }
    }

    const product = await db.product.update({
      where: { id: params.id },
      data: validatedData,
      include: {
        category: true,
      },
    })

    return NextResponse.json({ data: product })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
}

// DELETE /api/products/[id] - Delete product (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existingProduct = await db.product.findUnique({
      where: { id: params.id },
    })

    if (!existingProduct) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Soft delete by setting isActive to false
    await db.product.update({
      where: { id: params.id },
      data: { isActive: false },
    })

    return NextResponse.json({ message: 'Product deleted successfully' })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    )
  }
}

// PATCH /api/products/[id] - Restore deleted product
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'restore') {
      const existingProduct = await db.product.findUnique({
        where: { id: params.id },
      })

      if (!existingProduct) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        )
      }

      if (existingProduct.isActive) {
        return NextResponse.json(
          { error: 'Product is already active' },
          { status: 400 }
        )
      }

      const product = await db.product.update({
        where: { id: params.id },
        data: { isActive: true },
        include: { category: true },
      })

      return NextResponse.json({
        data: product,
        message: 'Product restored successfully'
      })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error restoring product:', error)
    return NextResponse.json(
      { error: 'Failed to restore product' },
      { status: 500 }
    )
  }
}