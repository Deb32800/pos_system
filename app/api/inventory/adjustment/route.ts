export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'

const adjustmentSchema = z.object({
  productId: z.string(),
  quantity: z.number().int(),
  type: z.enum(['ADJUSTMENT', 'PURCHASE', 'DAMAGE', 'TRANSFER', 'RETURN']),
  reason: z.string().min(1, 'Reason is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

// POST /api/inventory/adjustment - Stock adjustment
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = adjustmentSchema.parse(body)

    // Check if product exists
    const product = await db.product.findUnique({
      where: { id: validatedData.productId },
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Validate quantity based on type
    if (validatedData.type === 'ADJUSTMENT' || validatedData.type === 'DAMAGE') {
      // For adjustments and damage, quantity can be negative (stock out)
      if (validatedData.quantity < 0 && Math.abs(validatedData.quantity) > product.stockQuantity) {
        return NextResponse.json(
          { error: 'Cannot adjust stock below zero' },
          { status: 400 }
        )
      }
    }

    // For RETURN type, validate against actual sales
    if (validatedData.type === 'RETURN') {
      // Get total sold quantity of this product
      const soldItems = await db.saleItem.aggregate({
        where: { productId: validatedData.productId },
        _sum: { quantity: true }
      })
      const totalSold = soldItems._sum.quantity || 0

      // Get total already returned quantity of this product
      const returnedItems = await db.stockMovement.aggregate({
        where: {
          productId: validatedData.productId,
          type: 'RETURN'
        },
        _sum: { quantity: true }
      })
      const totalReturned = returnedItems._sum.quantity || 0

      // Max returnable = sold minus already returned
      const maxReturnable = totalSold - totalReturned

      if (validatedData.quantity > maxReturnable) {
        return NextResponse.json(
          {
            error: `Cannot return more than sold. You can return a maximum of ${maxReturnable} units of this product.`,
            maxReturnable
          },
          { status: 400 }
        )
      }
    }

    // Process adjustment transaction
    const result = await db.$transaction(async (tx: typeof db) => {
      // Calculate new stock quantity
      let newQuantity = product.stockQuantity + validatedData.quantity

      // For RETURN, we add to stock (quantity should be positive)
      // For DAMAGE, we subtract (quantity should be negative usually, or handled by caller)
      // The caller (StaffDashboard) sends positive quantity for RETURN.
      // But wait, the logic below just adds `validatedData.quantity`.
      // If type is RETURN, quantity is positive (adding back to stock).
      // If type is DAMAGE, quantity should be negative (removing from stock).

      // Let's ensure the logic holds.

      // Ensure stock doesn't go below zero
      newQuantity = Math.max(0, newQuantity)

      // Update product stock
      const updatedProduct = await tx.product.update({
        where: { id: validatedData.productId },
        data: {
          stockQuantity: newQuantity,
        },
      })

      // Create stock movement
      const stockMovement = await tx.stockMovement.create({
        data: {
          productId: validatedData.productId,
          type: validatedData.type,
          quantity: validatedData.quantity,
          reason: validatedData.reason,
          reference: validatedData.reference,
          notes: validatedData.notes,
        },
      })

      return { product: updatedProduct, stockMovement }
    })

    return NextResponse.json({
      data: result.product,
      stockMovement: result.stockMovement,
      message: 'Stock adjustment completed successfully'
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error adjusting stock:', error)
    return NextResponse.json(
      { error: 'Failed to adjust stock' },
      { status: 500 }
    )
  }
}

