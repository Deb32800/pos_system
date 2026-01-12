"use client"

import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { formatCurrency } from "@/lib/utils"

interface Product {
  id: string
  name: string
  sku: string
  sellingPrice: number
  costPrice: number
  stockQuantity: number
  minStockLevel: number
  maxStockLevel: number
  category: {
    id: string
    name: string
  }
}

interface Category {
  id: string
  name: string
}

export default function InventoryDashboard() {
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [lowStockOnly, setLowStockOnly] = useState(searchParams.get("lowStock") === "true")

  // Restock Dialog State
  const [restockOpen, setRestockOpen] = useState(false)
  const [restockSearch, setRestockSearch] = useState("")

  useEffect(() => {
    if (searchParams.get("restock") === "true") {
      setRestockOpen(true)
    }
  }, [searchParams])

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await fetch('/api/products?limit=100', { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch products')
      const result = await response.json()
      return result.data as Product[]
    },
    refetchOnMount: 'always', // Always refetch when component mounts
    staleTime: 0, // Data is always stale
  })

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await fetch('/api/categories', { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch categories')
      const result = await response.json()
      return result.data as Category[]
    },
    refetchOnMount: 'always',
    staleTime: 0,
  })

  const loading = productsLoading || categoriesLoading

  const summary = {
    totalProducts: products.length,
    totalStockValue: products.reduce((sum, p) => sum + (p.stockQuantity * p.costPrice), 0),
    totalRetailValue: products.reduce((sum, p) => sum + (p.stockQuantity * p.sellingPrice), 0),
    lowStockCount: products.filter(p => p.stockQuantity <= p.minStockLevel).length,
  }

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === "all" || product.category.id === selectedCategory
    const matchesLowStock = !lowStockOnly || product.stockQuantity <= product.minStockLevel

    return matchesSearch && matchesCategory && matchesLowStock
  })





  // Restock Filter Logic
  const filteredRestockProducts = products.filter(product => {
    if (!restockSearch) return true
    const lower = restockSearch.toLowerCase()
    return product.name.toLowerCase().includes(lower) || product.sku.toLowerCase().includes(lower) || (product as any).barcode?.includes(lower)
  }).sort((a, b) => {
    // Sort logic: Low stock first
    const aLow = a.stockQuantity <= a.minStockLevel ? 0 : 1
    const bLow = b.stockQuantity <= b.minStockLevel ? 0 : 1
    if (aLow !== bLow) return aLow - bLow
    return a.name.localeCompare(b.name)
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory Management</h2>
          <p className="text-muted-foreground">Manage your shop inventory and stock levels</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setRestockOpen(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Restock
          </Button>
          <Button asChild>
            <Link href="/admin/inventory/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              {categories.length} categories
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.totalStockValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              Cost value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Retail Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.totalRetailValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              Selling value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {summary.lowStockCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Need attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={lowStockOnly ? "default" : "outline"}
              onClick={() => setLowStockOnly(!lowStockOnly)}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Low Stock Only
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Products ({filteredProducts.length})</CardTitle>
          <CardDescription>
            Manage your product inventory and stock levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Cost Price</TableHead>
                <TableHead>Selling Price</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>{product.sku}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{product.category.name}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={product.stockQuantity <= product.minStockLevel ? "text-red-600 font-semibold" : ""}>
                        {product.stockQuantity}
                      </span>
                      {product.stockQuantity <= product.minStockLevel && (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Min: {product.minStockLevel}
                    </p>
                  </TableCell>
                  <TableCell>{formatCurrency(product.costPrice)}</TableCell>
                  <TableCell>{formatCurrency(product.sellingPrice)}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>Cost: {formatCurrency(product.stockQuantity * product.costPrice)}</div>
                      <div>Retail: {formatCurrency(product.stockQuantity * product.sellingPrice)}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/inventory/${product.id}`}>
                        Edit
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No products found</h3>
              <p className="text-muted-foreground mb-4">
                Try adjusting your search or filters
              </p>
              <Button asChild>
                <Link href="/admin/inventory/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restock Dialog */}
      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Quick Restock Product</DialogTitle>
            <DialogDescription>
              Select a product to edit its stock. Low stock items are shown first.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center space-x-2 py-4">
            <Search className="w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search by Name, SKU, or Barcode..."
              value={restockSearch}
              onChange={(e) => setRestockSearch(e.target.value)}
              className="flex-1"
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRestockProducts.length > 0 ? (
                  filteredRestockProducts.map(product => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.sku}</div>
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-2 ${product.stockQuantity <= product.minStockLevel ? 'text-red-600 font-bold' : ''}`}>
                          {product.stockQuantity}
                          {product.stockQuantity <= product.minStockLevel && <AlertTriangle className="h-3 w-3" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" asChild>
                          <Link href={`/admin/inventory/${product.id}`}>
                            Select
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                      No products found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestockOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

