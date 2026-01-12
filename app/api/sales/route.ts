export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'

const createSaleSchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    unitPrice: z.number().min(0), // client hint; server will validate/override
    totalPrice: z.number().min(0).optional(), // ignored; computed on server
    discount: z.number().min(0).default(0),
  })),
  paymentMethod: z.enum(['CASH', 'CARD', 'DIGITAL_WALLET', 'CREDIT']),
  discountAmount: z.number().min(0).default(0),
  notes: z.string().optional(),
  cashierId: z.string().optional(), // Will be overridden by server with authenticated user
  stripePaymentIntentId: z.string().optional(), // Stripe pi_xxx ID for card payments
})

// GET /api/sales - List sales with pagination
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20')), 100)
    const skip = (page - 1) * limit

    const [sales, total] = await Promise.all([
      db.sale.findMany({
        include: {
          saleItems: {
            include: {
              product: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.sale.count(),
    ])

    // Fetch cashier user info for all sales
    const cashierIds = [...new Set(sales.map(s => s.cashierId))]
    const users = await db.user.findMany({
      where: { id: { in: cashierIds } },
      select: { id: true, fullName: true, username: true },
    })
    const userMap = new Map(users.map(u => [u.id, u]))

    // Fetch return info for refunded sales
    const refundedSaleNumbers = sales
      .filter(s => s.status === 'REFUNDED')
      .map(s => s.saleNumber)

    const returnMovements = refundedSaleNumbers.length > 0
      ? await db.stockMovement.findMany({
        where: {
          type: 'RETURN',
          reference: { in: refundedSaleNumbers }
        },
        select: { reference: true, reason: true, notes: true, createdAt: true },
        distinct: ['reference'],
        orderBy: { createdAt: 'desc' },
      })
      : []

    const returnInfoMap = new Map(returnMovements.map(m => [m.reference, {
      reason: m.reason,
      notes: m.notes,
      returnedAt: m.createdAt,
    }]))

    // Attach user info and return info to each sale
    const salesWithUser = sales.map(sale => ({
      ...sale,
      cashier: userMap.get(sale.cashierId) || null,
      returnInfo: sale.status === 'REFUNDED' ? returnInfoMap.get(sale.saleNumber) || null : null,
    }))

    return NextResponse.json({
      data: salesWithUser,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching sales:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sales' },
      { status: 500 }
    )
  }
}

// POST /api/sales - Create new sale
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createSaleSchema.parse(body)

    // Validate all products exist and have sufficient stock
    const productIds = validatedData.items.map(item => item.productId)
    const products = await db.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
    })

    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: 'One or more products not found or inactive' },
        { status: 400 }
      )
    }

    // Check stock availability
    for (const item of validatedData.items) {
      const product = products.find(p => p.id === item.productId)
      if (!product || product.stockQuantity < item.quantity) {
        return NextResponse.json(
          { error: `Insufficient stock for ${product?.name || 'product'}` },
          { status: 400 }
        )
      }
    }

    // Generate sale number
    const saleNumber = `SALE-${Date.now()}`

    // Create sale transaction
    const result = await db.$transaction(async (tx) => {
      // Fetch all products referenced and map for quick access
      const productIds = validatedData.items.map(i => i.productId)
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: { id: true, name: true, sku: true, sellingPrice: true, taxPercent: true, stockQuantity: true }
      })
      if (products.length !== productIds.length) {
        throw new Error('One or more products not found or inactive')
      }
      const pmap = new Map(products.map(p => [p.id, p]))

      // Validate stock and compute server-side totals
      let subtotal = 0
      let totalTax = 0
      let totalItemDiscount = 0

      for (const item of validatedData.items) {
        const p = pmap.get(item.productId)!
        if (p.stockQuantity < item.quantity) {
          throw new Error(`Insufficient stock for ${p.name}`)
        }
        // Use server price; ignore client total
        // SECURITY FIX: Enforce server-side pricing. Client cannot override unitPrice.
        const unitPrice = p.sellingPrice
        const lineGross = unitPrice * item.quantity
        const lineDiscount = Math.min(item.discount || 0, lineGross)
        const lineNet = lineGross - lineDiscount
        const lineTax = p.taxPercent > 0 ? (lineNet * (p.taxPercent / 100)) : 0
        subtotal += lineNet
        totalTax += lineTax
        totalItemDiscount += lineDiscount
      }

      const saleLevelDiscount = validatedData.discountAmount || 0
      const totalBeforeSaleDiscount = subtotal + totalTax
      const totalAmount = Math.max(0, totalBeforeSaleDiscount - saleLevelDiscount)

      // Create sale - use authenticated user ID, not client-provided cashierId
      const sale = await tx.sale.create({
        data: {
          saleNumber,
          totalAmount,
          subtotal,
          taxAmount: totalTax,
          discountAmount: saleLevelDiscount + totalItemDiscount,
          paymentMethod: validatedData.paymentMethod,
          notes: validatedData.notes,
          cashierId: user.id,
          stripePaymentIntentId: validatedData.stripePaymentIntentId,
        },
      })

      // Create sale items and update stock
      const saleItems = []

      for (const item of validatedData.items) {
        const product = pmap.get(item.productId)!
        const unitPrice = product.sellingPrice
        const lineGross = unitPrice * item.quantity
        const lineDiscount = Math.min(item.discount || 0, lineGross)
        const lineNet = lineGross - lineDiscount

        // Create sale item
        const saleItem = await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice,
            totalPrice: lineNet,
            discount: lineDiscount,
          },
        })
        saleItems.push(saleItem)

        // Update product stock
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        })

        // Create stock movement
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'SALE',
            quantity: -item.quantity,
            reason: 'Sale',
            reference: saleNumber,
          },
        })
      }

      return { sale, saleItems }
    })

    // Fetch the complete sale with items and cashier info
    const completeSale = await db.sale.findUnique({
      where: { id: result.sale.id },
      include: {
        saleItems: {
          include: {
            product: true,
          },
        },
      },
    })

    // Fetch cashier info
    const cashierUser = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, fullName: true, username: true },
    })

    const saleWithCashier = {
      ...completeSale,
      cashier: cashierUser,
    }

    return NextResponse.json({ data: saleWithCashier }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating sale:', error)
    return NextResponse.json(
      { error: 'Failed to create sale' },
      { status: 500 }
    )
  }
}