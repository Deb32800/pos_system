import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')

    // Fetch all stock movements with type RETURN
    const returns = await db.stockMovement.findMany({
      where: {
        type: 'RETURN'
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            imagePath: true,
            sellingPrice: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    })

    // Format the data
    const formattedReturns = returns.map((ret: typeof returns[number]) => ({
      id: ret.id,
      reference: ret.reference,
      reason: ret.reason,
      notes: ret.notes,
      quantity: ret.quantity,
      createdAt: ret.createdAt,
      product: ret.product,
      estimatedValue: ret.product.sellingPrice * ret.quantity
    }))

    return NextResponse.json({
      success: true,
      data: formattedReturns
    })
  } catch (error) {
    console.error("Error fetching returns:", error)
    return NextResponse.json(
      { error: "Failed to fetch returns" },
      { status: 500 }
    )
  }
}
