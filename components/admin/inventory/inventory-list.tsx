"use client"

import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Package, Plus, Search, MoreHorizontal, Edit, Trash2, AlertTriangle, Printer } from "lucide-react"
import Link from "next/link"
import AdminLayout from "@/components/admin/admin-layout"
import { useSettings } from "@/components/settings-provider"

interface Product {
  id: string
  name: string
  sku: string
  price: number
  cost: number
  stock_quantity: number
  min_stock_level: number
  is_active: boolean
  categories: { id: string; name: string } | null
}

interface Category {
  id: string
  name: string
}

interface InventoryListProps {
  products: Product[]
  categories: Category[]
}

export default function InventoryList({ products = [], categories = [] }: InventoryListProps) {
  const { formatCurrency } = useSettings()
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [stockFilter, setStockFilter] = useState<string>("all")
  const [sortKey, setSortKey] = useState<'name' | 'price' | 'stock' | 'sku'>("name")
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>("asc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [visibleCols, setVisibleCols] = useState<{ sku: boolean; category: boolean; price: boolean; stock: boolean; status: boolean }>({ sku: true, category: true, price: true, stock: true, status: true })
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [scanStatus, setScanStatus] = useState<string>("")
  const scanBuffer = React.useRef<string>("")
  const lastKeyTime = React.useRef<number>(0)

  // Filter products based on search and filters
  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCategory = selectedCategory === "all" || product.categories?.id === selectedCategory

    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "low" && product.stock_quantity <= product.min_stock_level) ||
      (stockFilter === "out" && product.stock_quantity === 0) ||
      (stockFilter === "in" && product.stock_quantity > product.min_stock_level)

    return matchesSearch && matchesCategory && matchesStock
  })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir
      if (sortKey === 'sku') return a.sku.localeCompare(b.sku) * dir
      if (sortKey === 'price') return ((a.price || 0) - (b.price || 0)) * dir
      return (a.stock_quantity - b.stock_quantity) * dir
    })

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
  const pageData = filteredProducts.slice((page - 1) * pageSize, page * pageSize)

  const toggleAll = (checked: boolean) => {
    const slice = pageData.reduce((acc, p) => { acc[p.id] = checked; return acc }, {} as Record<string, boolean>)
    setSelected(prev => ({ ...prev, ...slice }))
  }

  // Scanner QoL: auto-focus and detect fast barcode input bursts
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const now = Date.now()
      const delta = now - lastKeyTime.current
      lastKeyTime.current = now
      if (delta > 100) {
        // likely new scan or human typing; reset if pause is long
        scanBuffer.current = ""
      }
      // Accept only visible characters
      if (e.key.length === 1 && /[\x20-\x7E]/.test(e.key)) {
        scanBuffer.current += e.key
      }
      if (e.key === 'Enter') {
        const code = scanBuffer.current.trim()
        scanBuffer.current = ""
        if (code.length >= 6) {
          setSearchTerm(code)
          setScanStatus(`Scanned: ${code}`)
          // Optional beep
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
            const o = ctx.createOscillator()
            const g = ctx.createGain()
            o.type = 'sine'; o.frequency.value = 880
            o.connect(g); g.connect(ctx.destination)
            g.gain.setValueAtTime(0.001, ctx.currentTime)
            g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01)
            o.start()
            setTimeout(() => { g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05); o.stop(ctx.currentTime + 0.06) }, 50)
          } catch { }
          setTimeout(() => setScanStatus(""), 1500)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const getStockStatus = (product: Product) => {
    if (product.stock_quantity === 0) {
      return { label: "Out of Stock", variant: "destructive" as const }
    } else if (product.stock_quantity <= product.min_stock_level) {
      return { label: "Low Stock", variant: "secondary" as const }
    } else {
      return { label: "In Stock", variant: "default" as const }
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Inventory Management</h2>
            <p className="text-muted-foreground">Manage your products and stock levels</p>
          </div>
          <Button asChild>
            <Link href="/admin/inventory/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Search and filter your inventory</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products by name or SKU..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-48">
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
              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Stock Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stock</SelectItem>
                  <SelectItem value="in">In Stock</SelectItem>
                  <SelectItem value="low">Low Stock</SelectItem>
                  <SelectItem value="out">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
              <Select value={`${sortKey}:${sortDir}`} onValueChange={(v) => { const [k, d] = v.split(':') as any; setSortKey(k); setSortDir(d) }}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name:asc">Name A→Z</SelectItem>
                  <SelectItem value="name:desc">Name Z→A</SelectItem>
                  <SelectItem value="sku:asc">SKU A→Z</SelectItem>
                  <SelectItem value="sku:desc">SKU Z→A</SelectItem>
                  <SelectItem value="price:asc">Price Low→High</SelectItem>
                  <SelectItem value="price:desc">Price High→Low</SelectItem>
                  <SelectItem value="stock:asc">Stock Low→High</SelectItem>
                  <SelectItem value="stock:desc">Stock High→Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scanStatus && <div className="mt-2 text-xs text-green-600">{scanStatus}</div>}
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {[
                { key: 'sku', label: 'SKU' },
                { key: 'category', label: 'Category' },
                { key: 'price', label: 'Price' },
                { key: 'stock', label: 'Stock' },
                { key: 'status', label: 'Status' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setVisibleCols(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                  className={`px-2 py-1 rounded border ${visibleCols[key as keyof typeof visibleCols] ? 'bg-muted' : 'bg-transparent'}`}
                >
                  {visibleCols[key as keyof typeof visibleCols] ? 'Hide' : 'Show'} {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Products Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Products ({filteredProducts.length})</CardTitle>
                <CardDescription>
                  {filteredProducts.length} of {products.length} products
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pageData.some(p => selected[p.id])}
                  onClick={() => { window.print() }}
                >
                  <Printer className="mr-2 h-4 w-4" /> Print Labels (selected)
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredProducts.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <input
                          type="checkbox"
                          onChange={(e) => toggleAll(e.target.checked)}
                          checked={pageData.every(p => selected[p.id]) && pageData.length > 0}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>Product</TableHead>
                      {visibleCols.category && <TableHead>Category</TableHead>}
                      {visibleCols.sku && <TableHead>SKU</TableHead>}
                      {visibleCols.price && <TableHead>Price</TableHead>}
                      {visibleCols.stock && <TableHead>Stock</TableHead>}
                      {visibleCols.status && <TableHead>Status</TableHead>}
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.map((product) => {
                      const stockStatus = getStockStatus(product)
                      return (
                        <TableRow key={product.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={!!selected[product.id]}
                              onChange={(e) => setSelected(prev => ({ ...prev, [product.id]: e.target.checked }))}
                              aria-label={`Select ${product.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{product.name}</p>
                              {product.stock_quantity <= product.min_stock_level && (
                                <div className="flex items-center gap-1 mt-1">
                                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                                  <span className="text-xs text-orange-600">Low stock alert</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          {visibleCols.category && (
                            <TableCell>
                              <Badge variant="outline">{product.categories?.name || "Uncategorized"}</Badge>
                            </TableCell>
                          )}
                          {visibleCols.sku && (
                            <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                          )}
                          {visibleCols.price && (
                            <TableCell>{formatCurrency(product.price)}</TableCell>
                          )}
                          {visibleCols.stock && (
                            <TableCell>
                              <div className="text-sm">
                                <span className="font-medium">{product.stock_quantity}</span>
                                <span className="text-muted-foreground"> / {product.min_stock_level} min</span>
                              </div>
                            </TableCell>
                          )}
                          {visibleCols.status && (
                            <TableCell>
                              <Badge variant={stockStatus.variant}>{stockStatus.label}</Badge>
                            </TableCell>
                          )}
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/inventory/${product.id}/edit`}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDeleteTarget({ id: product.id, name: product.name })} className="text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete (confirm)
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between mt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span>Rows per page</span>
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>
                      Page {page} of {totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No products found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm || selectedCategory !== "all" || stockFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Get started by adding your first product"}
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
      </div>
      {/* Confirm Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete product?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">This action cannot be undone. Are you sure you want to delete <span className="font-medium">{deleteTarget?.name}</span>?</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={async () => {
                if (!deleteTarget) return
                try {
                  const res = await fetch(`/api/products/${deleteTarget.id}`, { method: 'DELETE' })
                  if (!res.ok) throw new Error('Failed to delete')
                  window.location.reload()
                } catch (e) {
                  console.error('Delete failed:', e)
                } finally {
                  setDeleteTarget(null)
                }
              }}>Delete</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
