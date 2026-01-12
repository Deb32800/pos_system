export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// GET /api/sales/[id] - Get sale details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sale = await db.sale.findUnique({
      where: { id: params.id },
      include: {
        saleItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
                category: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!sale) {
      return NextResponse.json(
        { error: 'Sale not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: sale })
  } catch (error) {
    console.error('Error fetching sale:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sale' },
      { status: 500 }
    )
  }
}

// DELETE /api/sales/[id] - Cancel sale (refund) - Admin only
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can refund sales
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const sale = await db.sale.findUnique({
      where: { id: params.id },
      include: {
        saleItems: {
          include: {
            product: true,
          },
        },
      },
    })

    if (!sale) {
      return NextResponse.json(
        { error: 'Sale not found' },
        { status: 404 }
      )
    }

    if (sale.status === 'CANCELLED' || sale.status === 'REFUNDED') {
      return NextResponse.json(
        { error: 'Sale is already cancelled or refunded' },
        { status: 400 }
      )
    }

    // Process refund transaction
    const result = await db.$transaction(async (tx) => {
      // Update sale status
      const updatedSale = await tx.sale.update({
        where: { id: params.id },
        data: { status: 'REFUNDED' },
      })

      // Restore stock and create stock movements
      const stockMovements = []
      for (const item of sale.saleItems) {
        // Restore product stock using increment (avoids stale data race condition)
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: { increment: item.quantity },
          },
        })

        // Create stock movement for return
        const stockMovement = await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'RETURN',
            quantity: item.quantity,
            reason: 'Refund',
            reference: sale.saleNumber,
            notes: `Refund for sale ${sale.saleNumber}`,
          },
        })
        stockMovements.push(stockMovement)
      }

      return { sale: updatedSale, stockMovements }
    })

    return NextResponse.json({
      data: result.sale,
      message: 'Sale refunded successfully'
    })
  } catch (error) {
    console.error('Error refunding sale:', error)
    return NextResponse.json(
      { error: 'Failed to refund sale' },
      { status: 500 }
    )
  }
}
