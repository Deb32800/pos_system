"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, Save, Loader2, RefreshCw, Barcode } from "lucide-react"
import Link from "next/link"
import AdminLayout from "@/components/admin/admin-layout"
import { generateSKU, generateBarcode } from "@/lib/product-utils"
import { useSettings } from "@/components/settings-provider"

interface Category {
  id: string
  name: string
}

interface ProductFormProps {
  categories: Category[]
  product?: any
  isEditing?: boolean
}

export default function ProductForm({ categories, product, isEditing = false }: ProductFormProps) {
  const { formatCurrency, settings, refreshSettings } = useSettings()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [generatingCodes, setGeneratingCodes] = useState(false)

  // Get default tax from settings
  const defaultTax = parseFloat(settings.tax_rate || '0')

  const [formData, setFormData] = useState({
    name: product?.name || "",
    description: product?.description || "",
    sku: product?.sku || "",
    barcode: product?.barcode || "",
    category_id: product?.categoryId || product?.category_id || "",
    price: product?.sellingPrice || product?.selling_price || "",
    cost: product?.costPrice || product?.cost_price || "",
    stock_quantity: product?.stockQuantity || product?.stock_quantity || "",
    min_stock_level: product?.minStockLevel || product?.min_stock_level || "",
    tax_percent: product?.taxPercent ?? 0,
    is_active: product?.isActive ?? product?.is_active ?? true,
  })

  // Refresh settings on mount and update tax_percent if creating new product
  useEffect(() => {
    refreshSettings()
  }, [])

  // Update tax_percent when settings change (only for new products)
  useEffect(() => {
    if (!isEditing && !product) {
      const newDefaultTax = parseFloat(settings.tax_rate || '0')
      setFormData(prev => ({ ...prev, tax_percent: newDefaultTax }))
    }
  }, [settings.tax_rate, isEditing, product])

  const generateCodes = async () => {
    setGeneratingCodes(true)
    try {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 500))

      setFormData((prev) => ({
        ...prev,
        sku: generateSKU(),
        barcode: generateBarcode(),
      }))
    } catch (error) {
      console.error("Error generating codes:", error)
      alert("Error generating codes. Please try again.")
    } finally {
      setGeneratingCodes(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Ensure barcode exists and validate EAN-13
      let ensuredBarcode = String(formData.barcode || '')
      if (!ensuredBarcode) {
        ensuredBarcode = generateBarcode()
        setFormData(prev => ({ ...prev, barcode: ensuredBarcode }))
      }
      if (ensuredBarcode && ensuredBarcode.length === 13) {
        const digits = ensuredBarcode.split('').map(Number)
        const base = digits.slice(0, 12)
        const sum = base.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0)
        const check = (10 - (sum % 10)) % 10
        if (check !== digits[12]) {
          alert('Invalid EAN-13 barcode (check digit mismatch).')
          setLoading(false)
          return
        }
      }

      const productData = {
        name: formData.name,
        description: formData.description,
        sku: formData.sku,
        barcode: ensuredBarcode,
        categoryId: formData.category_id,
        sellingPrice: Number.parseFloat(formData.price),
        costPrice: Number.parseFloat(formData.cost || "0"),
        stockQuantity: Number.parseInt(formData.stock_quantity),
        minStockLevel: Number.parseInt(formData.min_stock_level),
        maxStockLevel: 10000,
        taxPercent: Number.parseFloat(String(formData.tax_percent) || "0"),
        isActive: formData.is_active,
      }

      const url = isEditing ? `/api/products/${product.id}` : '/api/products'
      const method = isEditing ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save product')
      }

      router.push("/admin/inventory")
    } catch (error) {
      console.error("Error saving product:", error)
      alert("Error saving product. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/inventory">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{isEditing ? "Edit Product" : "Add New Product"}</h2>
            <p className="text-muted-foreground">
              {isEditing ? "Update product information" : "Create a new product for your inventory"}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>Essential product details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="Enter product name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                    placeholder="Enter product description"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={formData.category_id} onValueChange={(value) => handleChange("category_id", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Product Codes</CardTitle>
                <CardDescription>SKU and barcode identification</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="sku">SKU *</Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => handleChange("sku", e.target.value)}
                      placeholder="Enter SKU (e.g., PRD-001)"
                      required
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generateCodes}
                    disabled={generatingCodes}
                    className="mb-0 bg-transparent"
                  >
                    {generatingCodes ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="barcode">Barcode</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="barcode"
                      value={formData.barcode}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, '')
                        if (v.length === 12) {
                          const digits = v.split('').map(Number)
                          const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0)
                          const check = (10 - (sum % 10)) % 10
                          handleChange("barcode", v + String(check))
                        } else {
                          handleChange("barcode", v)
                        }
                      }}
                      placeholder="13-digit barcode"
                    />
                    <Barcode className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">Auto-generated EAN-13 format barcode</p>
                </div>

                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Click the refresh button to auto-generate unique SKU and barcode codes
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Pricing & Inventory */}
            <Card>
              <CardHeader>
                <CardTitle>Pricing & Inventory</CardTitle>
                <CardDescription>Set prices and stock levels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Selling Price *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.price}
                      onChange={(e) => handleChange("price", e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cost">Cost Price</Label>
                    <Input
                      id="cost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.cost}
                      onChange={(e) => handleChange("cost", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tax_percent">Tax (%)</Label>
                    <Input
                      id="tax_percent"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={formData.tax_percent}
                      onChange={(e) => handleChange("tax_percent", e.target.value)}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground">Default: {defaultTax}% from settings</p>
                  </div>
                </div>

                {formData.price && formData.cost && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-800">
                      Profit Margin:{" "}
                      {(
                        ((Number.parseFloat(formData.price) - Number.parseFloat(formData.cost)) /
                          Number.parseFloat(formData.cost)) *
                        100
                      ).toFixed(1)}
                      %
                    </p>
                    <p className="text-xs text-green-600">
                      Profit per unit: {formatCurrency(Number.parseFloat(formData.price) - Number.parseFloat(formData.cost || "0"))}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stock_quantity">Stock Quantity *</Label>
                    <Input
                      id="stock_quantity"
                      type="number"
                      min="0"
                      value={formData.stock_quantity}
                      onChange={(e) => handleChange("stock_quantity", e.target.value)}
                      placeholder="0"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="min_stock_level">Minimum Stock Level *</Label>
                    <Input
                      id="min_stock_level"
                      type="number"
                      min="0"
                      value={formData.min_stock_level}
                      onChange={(e) => handleChange("min_stock_level", e.target.value)}
                      placeholder="0"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => handleChange("is_active", checked)}
                  />
                  <Label htmlFor="is_active">Product is active</Label>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {isEditing ? "Update Product" : "Create Product"}
                </>
              )}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/admin/inventory">Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
