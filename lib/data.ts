import { db } from './db'
import type { Prisma } from '@prisma/client'

// Types for the database models
export type Category = {
  id: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export type Product = {
  id: string
  name: string
  description: string | null
  sku: string
  barcode: string | null
  costPrice: number
  sellingPrice: number
  stockQuantity: number
  minStockLevel: number
  maxStockLevel: number
  isActive: boolean
  categoryId: string
  imagePath: string | null
  createdAt: Date
  updatedAt: Date
  category?: Category
}

export type Sale = {
  id: string
  saleNumber: string
  totalAmount: number
  subtotal: number
  taxAmount: number
  discountAmount: number
  paymentMethod: 'CASH' | 'CARD' | 'DIGITAL_WALLET' | 'CREDIT'
  status: 'PENDING' | 'COMPLETED' | 'REFUNDED' | 'CANCELLED'
  notes: string | null
  cashierId: string
  createdAt: Date
  updatedAt: Date
  saleItems?: SaleItem[]
}

export type SaleItem = {
  id: string
  saleId: string
  productId: string
  quantity: number
  unitPrice: number
  totalPrice: number
  discount: number
  product?: Product
}

export type StockMovement = {
  id: string
  productId: string
  type: 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'RETURN' | 'DAMAGE' | 'TRANSFER'
  quantity: number
  reason: string
  reference: string | null
  notes: string | null
  createdAt: Date
  product?: Product
}

// Database functions
export const dataService = {
  // Products
  async getProducts(search?: string, categoryId?: string, lowStock?: boolean) {
    try {
      const where: any = { isActive: true }
      
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
      
      if (lowStock) {
        where.stockQuantity = { lte: db.product.fields.minStockLevel }
      }

      const products = await db.product.findMany({
        where,
        include: { category: true },
        orderBy: { name: 'asc' },
      })

      return { data: products, error: null }
    } catch (error) {
      console.error('Error fetching products:', error)
      return { data: null, error: 'Failed to fetch products' }
    }
  },

  async getProduct(id: string) {
    try {
      const product = await db.product.findUnique({
        where: { id },
        include: { category: true },
      })
      return { data: product, error: null }
    } catch (error) {
      console.error('Error fetching product:', error)
      return { data: null, error: 'Failed to fetch product' }
    }
  },

  async createProduct(productData: Prisma.ProductUncheckedCreateInput) {
    try {
      const product = await db.product.create({
        data: productData,
        include: { category: true },
      })
      return { data: product, error: null }
    } catch (error) {
      console.error('Error creating product:', error)
      return { data: null, error: 'Failed to create product' }
    }
  },

  async updateProduct(id: string, updates: Prisma.ProductUncheckedUpdateInput) {
    try {
      const product = await db.product.update({
        where: { id },
        data: updates,
        include: { category: true },
      })
      return { data: product, error: null }
    } catch (error) {
      console.error('Error updating product:', error)
      return { data: null, error: 'Failed to update product' }
    }
  },

  async deleteProduct(id: string) {
    try {
      await db.product.update({
        where: { id },
        data: { isActive: false },
      })
      return { error: null }
    } catch (error) {
      console.error('Error deleting product:', error)
      return { error: 'Failed to delete product' }
    }
  },

  // Categories
  async getCategories() {
    try {
      const categories = await db.category.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      })
      return { data: categories, error: null }
    } catch (error) {
      console.error('Error fetching categories:', error)
      return { data: null, error: 'Failed to fetch categories' }
    }
  },

  async createCategory(categoryData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const category = await db.category.create({
        data: categoryData,
      })
      return { data: category, error: null }
    } catch (error) {
      console.error('Error creating category:', error)
      return { data: null, error: 'Failed to create category' }
    }
  },

  // Sales
  async getSales(page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit
      
      const [sales, total] = await Promise.all([
        db.sale.findMany({
          include: {
            saleItems: {
              include: { product: { select: { id: true, name: true, sku: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        db.sale.count(),
      ])

      return { 
        data: sales, 
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        error: null 
      }
    } catch (error) {
      console.error('Error fetching sales:', error)
      return { data: null, error: 'Failed to fetch sales' }
    }
  },

  async createSale(saleData: {
    items: Array<{
      productId: string
      quantity: number
      unitPrice: number
      totalPrice: number
      discount?: number
    }>
    paymentMethod: 'CASH' | 'CARD' | 'DIGITAL_WALLET' | 'CREDIT'
    discountAmount?: number
    notes?: string
    cashierId: string
  }) {
    try {
      // Calculate totals
      const subtotal = saleData.items.reduce((sum, item) => sum + item.totalPrice, 0)
      const totalAmount = subtotal - (saleData.discountAmount || 0)

      // Generate sale number
      const saleNumber = `SALE-${Date.now()}`

      // Create sale transaction
      const result = await db.$transaction(async (tx) => {
        // Create sale
        const sale = await tx.sale.create({
          data: {
            saleNumber,
            totalAmount,
            subtotal,
            discountAmount: saleData.discountAmount || 0,
            paymentMethod: saleData.paymentMethod,
            notes: saleData.notes,
            cashierId: saleData.cashierId,
          },
        })

        // Create sale items and update stock
        for (const item of saleData.items) {
          // Create sale item
          await tx.saleItem.create({
            data: {
              saleId: sale.id,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
              discount: item.discount || 0,
            },
          })

          // Update product stock
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: {
                decrement: item.quantity,
              },
            },
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

        return sale
      })

      return { data: result, error: null }
    } catch (error) {
      console.error('Error creating sale:', error)
      return { data: null, error: 'Failed to create sale' }
    }
  },

  // Dashboard stats
  async getDashboardStats() {
    try {
      const [
        totalProducts,
        totalCategories,
        totalSales,
        lowStockProducts,
        recentSales,
        recentReturns,
      ] = await Promise.all([
        db.product.count({ where: { isActive: true } }),
        db.category.count({ where: { isActive: true } }),
        db.sale.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
            status: 'COMPLETED',
          },
        }),
        db.product.findMany({
          where: {
            isActive: true,
            stockQuantity: {
              lte: db.product.fields.minStockLevel,
            },
          },
          include: { category: true },
          take: 10,
        }),
        db.sale.findMany({
          include: {
            saleItems: {
              include: { product: { select: { name: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        db.stockMovement.findMany({
          where: { type: 'RETURN' },
          include: {
            product: { select: { id: true, name: true, sellingPrice: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ])

      const salesTotal = await db.sale.aggregate({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
          status: 'COMPLETED',
        },
        _sum: { totalAmount: true },
      })

      // Fetch cashier names for recent sales
      const cashierIds = [...new Set(recentSales.map(s => s.cashierId))]
      const users = await db.user.findMany({
        where: { id: { in: cashierIds } },
        select: { id: true, fullName: true, username: true },
      })
      const userMap = new Map(users.map(u => [u.id, u.fullName || u.username]))

      // Combine sales and returns into activity log, sorted by date
      const activityLog = [
        ...recentSales.map(sale => ({
          id: sale.id,
          type: 'sale' as const,
          reference: sale.saleNumber,
          amount: sale.totalAmount,
          description: `${sale.saleItems.length} item(s)`,
          createdAt: sale.createdAt,
          cashierId: sale.cashierId,
          cashierName: userMap.get(sale.cashierId) || sale.cashierId,
        })),
        ...recentReturns.map(ret => ({
          id: ret.id,
          type: 'return' as const,
          reference: ret.reference,
          amount: ret.product.sellingPrice * ret.quantity,
          description: `${ret.product.name} (x${ret.quantity})`,
          reason: ret.reason,
          createdAt: ret.createdAt,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8)

      return {
        data: {
          totalProducts,
          totalCategories,
          totalSales,
          monthlySalesTotal: salesTotal._sum.totalAmount || 0,
          lowStockCount: lowStockProducts.length,
          lowStockProducts,
          recentSales,
          recentReturns,
          activityLog,
        },
        error: null,
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
      return { data: null, error: 'Failed to fetch dashboard stats' }
    }
  },
}

// Utility functions
export const generateSKU = () => {
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `CAT-${timestamp}-${random}`
}

export const generateBarcode = () => {
  // Generate a simple 13-digit barcode
  let barcode = ""
  for (let i = 0; i < 12; i++) {
    barcode += Math.floor(Math.random() * 10).toString()
  }

  // Calculate check digit (simplified)
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number.parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const checkDigit = (10 - (sum % 10)) % 10

  return barcode + checkDigit.toString()
}

