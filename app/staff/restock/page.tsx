"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Search, AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react"

interface Product {
    id: string
    name: string
    sku: string
    stockQuantity: number
    minStockLevel: number
    costPrice: number
    sellingPrice: number
    category: { name: string }
}

export default function StaffRestockPage() {
    const [searchTerm, setSearchTerm] = useState("")

    const { data: products = [], isLoading } = useQuery({
        queryKey: ['products'],
        queryFn: async () => {
            const response = await fetch('/api/products?limit=100', { cache: 'no-store' })
            if (!response.ok) throw new Error('Failed to fetch products')
            const result = await response.json()
            return result.data as Product[]
        },
        staleTime: 0,
    })

    // Filter & Sort logic
    const filteredProducts = products.filter(product => {
        if (!searchTerm) return true
        const lower = searchTerm.toLowerCase()
        const barcode = (product as any).barcode || ""
        return product.name.toLowerCase().includes(lower) ||
            product.sku.toLowerCase().includes(lower) ||
            barcode.includes(lower)
    }).sort((a, b) => {
        // Prioritize Low Stock
        const aLow = a.stockQuantity <= a.minStockLevel ? 0 : 1
        const bLow = b.stockQuantity <= b.minStockLevel ? 0 : 1
        if (aLow !== bLow) return aLow - bLow
        return a.name.localeCompare(b.name)
    })

    return (
        <div className="container mx-auto py-8 max-w-5xl">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/staff">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <RefreshCw className="h-6 w-6" />
                        Quick Restock
                    </h1>
                    <p className="text-muted-foreground">Find and update stock for products</p>
                </div>
            </div>

            <div className="bg-white rounded-lg border shadow-sm p-4">
                {/* Search */}
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder="Search by Name, SKU, or Barcode..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        autoFocus
                    />
                </div>

                {/* Table */}
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Stock</TableHead>
                                <TableHead className="w-[100px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">Loading...</TableCell>
                                </TableRow>
                            ) : filteredProducts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                        No products found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredProducts.map(product => (
                                    <TableRow key={product.id}>
                                        <TableCell>
                                            <div className="font-medium">{product.name}</div>
                                            <div className="text-xs text-muted-foreground">{product.sku}</div>
                                        </TableCell>
                                        <TableCell>
                                            {product.category?.name || '-'}
                                        </TableCell>
                                        <TableCell>
                                            <div className={`flex items-center gap-2 ${product.stockQuantity <= product.minStockLevel ? 'text-red-600 font-bold' : ''}`}>
                                                {product.stockQuantity}
                                                {product.stockQuantity <= product.minStockLevel && <AlertTriangle className="h-4 w-4" />}
                                            </div>
                                            <div className="text-xs text-muted-foreground">Min: {product.minStockLevel}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Button size="sm" asChild>
                                                <Link href={`/staff/inventory/${product.id}`}>
                                                    Select
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    )
}
