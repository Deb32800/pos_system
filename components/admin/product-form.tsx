"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ArrowLeft, RefreshCw, Save, Upload, Printer, Trash2, AlertCircle, Edit, RotateCcw, X } from "lucide-react"
import JsBarcode from 'jsbarcode'
import { generateBarcode as utilGenerateBarcode } from "@/lib/data"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"

interface Category {
  id: string
  name: string
}

interface ProductFormData {
  name: string
  description: string
  sku: string
  barcode: string
  costPrice: number
  sellingPrice: number
  taxPercent: number
  stockQuantity: number
  minStockLevel: number
  maxStockLevel: number
  categoryId: string
}

type BarcodeMode = "generate" | "scan" | "manual"

export default function ProductForm({ productId, redirectTo = "/admin/inventory", allowDelete = true }: { productId?: string; redirectTo?: string; allowDelete?: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>("scan")
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    description: '',
    sku: '',
    barcode: '',
    costPrice: 0,
    sellingPrice: 0,
    taxPercent: 0,
    stockQuantity: 0,
    minStockLevel: 5,
    maxStockLevel: 100,
    categoryId: ''
  })

  const barcodeRef = useRef<SVGSVGElement | null>(null)
  // Scan mode helpers
  const [scanInput, setScanInput] = useState("")
  const scanInputRef = useRef<HTMLInputElement | null>(null)
  const scanIdleTimer = useRef<number | null>(null)
  const lastLookedUpBarcode = useRef<string>("")
  const [addCatOpen, setAddCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [newCatDesc, setNewCatDesc] = useState("")
  const [savingCategory, setSavingCategory] = useState(false)

  // Delete product states
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [categoryWillBeEmpty, setCategoryWillBeEmpty] = useState(false)

  // Edit confirmation states
  const [showEditConfirm, setShowEditConfirm] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<{ field: string, from: string | number, to: string | number }[]>([])
  const originalDataRef = useRef<ProductFormData | null>(null)

  // Similarity detection states
  interface SimilarProduct {
    id: string
    name: string
    sku: string
    barcode: string | null
    stockQuantity: number
    sellingPrice: number
    isActive: boolean
    status: 'active' | 'deleted'
    matchType: 'name' | 'sku' | 'barcode'
    category?: { id: string; name: string } | null
    similarity?: number
  }
  const [similarNames, setSimilarNames] = useState<SimilarProduct[]>([])
  const [showSimilarNames, setShowSimilarNames] = useState(false)
  const [skuDuplicate, setSkuDuplicate] = useState<SimilarProduct | null>(null)
  const [barcodeDuplicate, setBarcodeDuplicate] = useState<SimilarProduct | null>(null)
  const [restoreProduct, setRestoreProduct] = useState<SimilarProduct | null>(null)
  const [exactMatchWarning, setExactMatchWarning] = useState<SimilarProduct | null>(null)
  const [restoring, setRestoring] = useState(false)
  const nameSearchTimer = useRef<number | null>(null)
  const skuCheckTimer = useRef<number | null>(null)

  useEffect(() => {
    if (formData.barcode && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, formData.barcode, { format: 'EAN13', displayValue: true, fontSize: 14, height: 60, margin: 6 })
      } catch {
        try {
          JsBarcode(barcodeRef.current, formData.barcode, { format: 'CODE128', displayValue: true, fontSize: 14, height: 60, margin: 6 })
        } catch { }
      }
    }
  }, [formData.barcode])

  const handlePrintBarcode = () => {
    const svg = barcodeRef.current
    if (!svg) return
    const html = `<!doctype html>
<html>
<head>
  <meta charset='utf-8'>
  <title>Print Barcode</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100%; 
      height: 100%; 
    }
    body { 
      display: flex; 
      justify-content: center; 
      align-items: center;
      padding: 4mm;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .barcode-container {
      text-align: center;
    }
    svg {
      max-width: 100%;
      height: auto;
    }
    @media print {
      @page { 
        margin: 2mm; 
        size: auto;
      }
      body { 
        padding: 2mm;
        display: flex;
        justify-content: center;
        align-items: center;
      }
    }
  </style>
</head>
<body>
  <div class="barcode-container">${svg.outerHTML}</div>
</body>
</html>`
    const w = window.open('', '_blank', 'width=400,height=250')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  // Fetch categories
  const { data: categories = [], refetch: refetchCategories } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await fetch('/api/categories')
      if (!response.ok) throw new Error('Failed to fetch categories')
      const result = await response.json()
      return result.data as Category[]
    }
  })

  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await fetch('/api/settings')
      if (!response.ok) throw new Error('Failed to fetch settings')
      const result = await response.json()
      return result.data
    },
    staleTime: 0, // Always refetch to get latest tax_rate
  })

  // Refetch settings on mount to get latest tax rate
  useEffect(() => {
    refetchSettings()
  }, [])

  useEffect(() => {
    if (!productId && settings?.default_tax_percent) {
      setFormData(prev => ({ ...prev, taxPercent: parseFloat(settings.default_tax_percent) }))
    }
  }, [productId, settings?.default_tax_percent])

  const { data: product } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}`)
      if (!response.ok) throw new Error('Failed to fetch product')
      const result = await response.json()
      return result.data
    },
    enabled: !!productId
  })

  useEffect(() => {
    if (product) {
      const productData: ProductFormData = {
        name: product.name,
        description: product.description || '',
        sku: product.sku,
        barcode: product.barcode || '',
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        taxPercent: product.taxPercent ?? 0,
        stockQuantity: product.stockQuantity,
        minStockLevel: product.minStockLevel,
        maxStockLevel: product.maxStockLevel,
        categoryId: product.categoryId,
      }
      setFormData(productData)
      // Store original data for change detection
      originalDataRef.current = { ...productData }
      if (product.imageUrl) {
        setImagePreview(product.imageUrl)
      }
    }
  }, [product])

  useEffect(() => {
    if (!productId) {
      // Check for query params for pre-filling (e.g. from external API lookup)
      const params = new URLSearchParams(window.location.search)
      const prefillName = params.get('name')
      const prefillSku = params.get('sku')
      const prefillPrice = params.get('price')
      const prefillDesc = params.get('description')
      const prefillImage = params.get('image')

      if (prefillName || prefillSku) {
        setFormData(prev => ({
          ...prev,
          name: prefillName || prev.name,
          sku: prefillSku || prev.sku, // Use provided SKU/Barcode
          barcode: prefillSku || prev.barcode, // Usually barcode is used as SKU in this flow
          sellingPrice: prefillPrice ? parseFloat(prefillPrice) : prev.sellingPrice,
          description: prefillDesc || prev.description,
        }))
        if (prefillImage) setImagePreview(prefillImage)
      } else {
        // Default to empty for scan mode
        if (barcodeMode === 'generate') {
          generateSKU()
          handleGenerateBarcode()
        }
      }
    }
  }, [productId])



  const generateSKU = () => {
    const timestamp = Date.now().toString().slice(-6)
    const random = Math.random().toString(36).substring(2, 5).toUpperCase()
    setFormData(prev => ({ ...prev, sku: `CAT-${timestamp}-${random}` }))
  }

  const handleGenerateBarcode = () => {
    const code = utilGenerateBarcode()
    setFormData(prev => ({ ...prev, barcode: code }))
  }

  // Image upload handling
  const onImageSelected = async (file: File | null) => {
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const uploadImageIfNeeded = async (): Promise<string | undefined> => {
    if (!imageFile) return undefined
    try {
      setUploading(true)
      const body = new FormData()
      body.append('file', imageFile)
      const res = await fetch('/api/uploads', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Upload failed')
      return json.path as string
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Block submission if duplicates exist
    if (!productId) {
      if (skuDuplicate) {
        toast.error(`Cannot save: A product with SKU "${formData.sku}" already exists`)
        return
      }
      if (barcodeDuplicate) {
        toast.error(`Cannot save: A product with barcode "${formData.barcode}" already exists`)
        return
      }

      // Check for near-duplicate names (90%+ similarity) - show warning popup
      const exactMatch = similarNames.find(p => (p.similarity ?? 0) >= 0.9)
      if (exactMatch && !exactMatchWarning) {
        setExactMatchWarning(exactMatch)
        return // Stop submission, let user decide
      }
    }

    // For editing, check for changes and show confirmation dialog
    if (productId && originalDataRef.current && !showEditConfirm) {
      const changes: { field: string, from: string | number, to: string | number }[] = []

      if (originalDataRef.current.name !== formData.name) {
        changes.push({ field: 'Product Name', from: originalDataRef.current.name, to: formData.name })
      }
      if (originalDataRef.current.sellingPrice !== formData.sellingPrice) {
        changes.push({ field: 'Selling Price', from: originalDataRef.current.sellingPrice, to: formData.sellingPrice })
      }
      if (originalDataRef.current.costPrice !== formData.costPrice) {
        changes.push({ field: 'Cost Price', from: originalDataRef.current.costPrice, to: formData.costPrice })
      }
      if (originalDataRef.current.stockQuantity !== formData.stockQuantity) {
        changes.push({ field: 'Stock Quantity', from: originalDataRef.current.stockQuantity, to: formData.stockQuantity })
      }

      if (changes.length > 0) {
        setPendingChanges(changes)
        setShowEditConfirm(true)
        return // Wait for user confirmation
      }
    }

    await saveProduct()
  }

  // Actual save logic (called directly or after confirmation)
  const saveProduct = async () => {
    setLoading(true)
    setShowEditConfirm(false)

    try {
      const url = productId ? `/api/products/${productId}` : '/api/products'
      const method = productId ? 'PUT' : 'POST'

      // Upload image first (if any) to get imagePath
      let finalImagePath = await uploadImageIfNeeded()

      // If no new file uploaded, but we have a preview that is a URL (from external API or existing product), use that
      if (!finalImagePath && imagePreview && !imagePreview.startsWith('data:')) {
        finalImagePath = imagePreview
      }

      const payload = finalImagePath ? { ...formData, imagePath: finalImagePath } : { ...formData }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (response.ok) {
        toast.success(productId ? 'Product updated!' : 'Product created!')
        router.push(redirectTo)
      } else {
        toast.error(result.error || 'Failed to save product')
      }
    } catch (error) {
      console.error('Error saving product:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save product')
    } finally {
      setLoading(false)
    }
  }

  // Check if deleting this product will empty its category
  const handleDeleteClick = async () => {
    if (!productId || !formData.categoryId) return

    try {
      // Check how many products are in this category
      const res = await fetch(`/api/products?categoryId=${formData.categoryId}`)
      const data = await res.json()
      const productsInCategory = data.data?.length || 0

      // If only 1 product (this one), category will be empty
      setCategoryWillBeEmpty(productsInCategory <= 1)
      setShowDeleteConfirm(true)
    } catch (error) {
      console.error('Error checking category:', error)
      setCategoryWillBeEmpty(false)
      setShowDeleteConfirm(true)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!productId) return

    setDeleting(true)
    try {
      // Delete the product
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete product')
      }

      // If category will be empty, delete the category too
      if (categoryWillBeEmpty && formData.categoryId) {
        await fetch(`/api/categories/${formData.categoryId}`, { method: 'DELETE' })
        toast.success('Product and empty category deleted')
      } else {
        toast.success('Product deleted successfully')
      }

      router.push(redirectTo)
    } catch (error) {
      console.error('Error deleting product:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete product')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  // Check for similar products by name (debounced)
  const checkNameSimilarity = async (name: string) => {
    if (!name || name.length < 2 || productId) return

    try {
      const res = await fetch(`/api/products/similarity?name=${encodeURIComponent(name)}${productId ? `&excludeId=${productId}` : ''}`)
      const data = await res.json()

      if (data.data?.nameMatches?.length > 0) {
        setSimilarNames(data.data.nameMatches)
      } else {
        setSimilarNames([])
      }
      // Reset any previous exact match warning when name changes
      setExactMatchWarning(null)
    } catch (e) {
      console.error('Error checking name similarity:', e)
    }
  }

  // Check for duplicate SKU (debounced)
  const checkSkuDuplicate = async (sku: string) => {
    if (!sku || sku.length < 2 || productId) return

    try {
      const res = await fetch(`/api/products/similarity?sku=${encodeURIComponent(sku)}${productId ? `&excludeId=${productId}` : ''}`)
      const data = await res.json()

      if (data.data?.skuMatch) {
        setSkuDuplicate(data.data.skuMatch)
        // If deleted, show restore dialog
        if (data.data.skuMatch.status === 'deleted') {
          setRestoreProduct(data.data.skuMatch)
        }
      } else {
        setSkuDuplicate(null)
      }
    } catch (e) {
      console.error('Error checking SKU:', e)
    }
  }

  // Check for duplicate barcode
  const checkBarcodeDuplicate = async (barcode: string) => {
    if (!barcode || barcode.length < 3 || productId) return

    try {
      const res = await fetch(`/api/products/similarity?barcode=${encodeURIComponent(barcode)}${productId ? `&excludeId=${productId}` : ''}`)
      const data = await res.json()

      if (data.data?.barcodeMatch) {
        setBarcodeDuplicate(data.data.barcodeMatch)
        // If deleted, show restore dialog
        if (data.data.barcodeMatch.status === 'deleted') {
          setRestoreProduct(data.data.barcodeMatch)
        }
      } else {
        setBarcodeDuplicate(null)
      }
    } catch (e) {
      console.error('Error checking barcode:', e)
    }
  }

  // Restore a deleted product
  const handleRestoreProduct = async () => {
    if (!restoreProduct) return

    setRestoring(true)
    try {
      const res = await fetch(`/api/products/${restoreProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      })

      if (res.ok) {
        toast.success('Product restored successfully!')
        router.push(`${redirectTo.includes('/staff') ? '/staff/inventory' : '/admin/inventory'}/${restoreProduct.id}`)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to restore product')
      }
    } catch (e) {
      console.error('Error restoring product:', e)
      toast.error('Failed to restore product')
    } finally {
      setRestoring(false)
      setRestoreProduct(null)
    }
  }

  const handleInputChange = (field: keyof ProductFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))

    // Debounced similarity checks for specific fields
    if (field === 'name' && typeof value === 'string' && !productId) {
      if (nameSearchTimer.current) window.clearTimeout(nameSearchTimer.current)
      nameSearchTimer.current = window.setTimeout(() => {
        checkNameSimilarity(value)
      }, 400)
    }

    if (field === 'sku' && typeof value === 'string' && !productId) {
      if (skuCheckTimer.current) window.clearTimeout(skuCheckTimer.current)
      skuCheckTimer.current = window.setTimeout(() => {
        checkSkuDuplicate(value)
      }, 400)
    }
  }

  const checkExternalProduct = async (barcode: string) => {
    if (!barcode || barcode.length < 3) return

    // Skip if we already looked up this barcode (prevents repeated lookups from overwriting user data)
    if (lastLookedUpBarcode.current === barcode) return
    lastLookedUpBarcode.current = barcode

    // First check for duplicates using similarity API
    await checkBarcodeDuplicate(barcode)

    try {
      const res = await fetch(`/api/products/lookup?barcode=${barcode}`)
      const data = await res.json()

      if (data.found) {
        if (data.source === 'local') {
          // Local product found - this is now handled by checkBarcodeDuplicate
          // Just show a toast, the duplicate UI will handle the rest
          if (!productId && !barcodeDuplicate) {
            // Refresh duplicate check in case it wasn't caught
            await checkBarcodeDuplicate(barcode)
          }
        } else {
          // External found - auto fill (only if no local duplicate)
          if (!barcodeDuplicate) {
            setFormData(prev => ({
              ...prev,
              name: data.product.name || prev.name,
              description: data.product.description || prev.description,
              sellingPrice: data.product.sellingPrice || prev.sellingPrice,
            }))
            if (data.product.imagePath) {
              setImagePreview(data.product.imagePath)
            }
            toast.success("Product found! Details auto-filled.")
          }
        }
      } else if (!barcodeDuplicate) {
        toast.info("Product not in database. Please enter details manually.")
      }
    } catch (e) {
      console.error("Error checking external product", e)
      toast.error("Error checking external database.")
    }
  }

  // Calculate profit margin
  const calculateProfitMargin = () => {
    if (formData.costPrice > 0 && formData.sellingPrice > 0) {
      const profit = formData.sellingPrice - formData.costPrice
      const margin = (profit / formData.sellingPrice) * 100
      return {
        profit,
        margin: margin.toFixed(1)
      }
    }
    return null
  }

  const profitData = calculateProfitMargin()

  // Calculate inventory values
  const inventoryValue = formData.stockQuantity * formData.costPrice
  const retailValue = formData.stockQuantity * formData.sellingPrice
  const finalPriceWithTax = useMemo(() => {
    const price = Number(formData.sellingPrice) || 0
    const tax = Number(formData.taxPercent) || 0
    return price + price * (tax / 100)
  }, [formData.sellingPrice, formData.taxPercent])

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {productId ? 'Edit Product' : 'Add New Product'}
          </h2>
          <p className="text-muted-foreground">
            {productId ? 'Update product information' : 'Add a new product to your inventory'}
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Product Information</CardTitle>
          <CardDescription>
            Fill in the details for your cat shop product
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Image Upload */}
            <div className="space-y-2">
              <Label htmlFor="image">Product Image</Label>
              <div className="flex items-center gap-4">
                <Input id="image" type="file" accept="image/*" onChange={(e) => onImageSelected(e.target.files?.[0] || null)} />
                <Button type="button" variant="outline" disabled={!imageFile || uploading} onClick={async () => { await uploadImageIfNeeded() }}>
                  <Upload className="mr-2 h-4 w-4" />
                  {uploading ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
              {imagePreview && (
                <div className="mt-2">
                  <img src={imagePreview} alt="Preview" className="h-32 w-32 object-cover rounded border" />
                </div>
              )}
            </div>

            {/* Basic Information */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="e.g., Premium Cat Food"
                  required
                />
                {/* Similar Products Warning */}
                {similarNames.length > 0 && !productId && (
                  <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded-md">
                    <AlertCircle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                    <span className="text-sm text-orange-800">
                      {similarNames.length} similar product{similarNames.length > 1 ? 's' : ''} found
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="ml-auto text-xs h-7 border-orange-300 text-orange-700 hover:bg-orange-100"
                      onClick={() => setShowSimilarNames(true)}
                    >
                      View
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <Select value={formData.categoryId} onValueChange={(value) => handleInputChange('categoryId', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
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
                  <Dialog open={addCatOpen} onOpenChange={setAddCatOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm">Add Category</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Category</DialogTitle>
                        <DialogDescription>Create a category without leaving the form.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 py-2">
                        <div className="space-y-2">
                          <Label htmlFor="newCatName">Name *</Label>
                          <Input id="newCatName" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="e.g., Cat Toys" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="newCatDesc">Description</Label>
                          <Textarea id="newCatDesc" value={newCatDesc} onChange={(e) => setNewCatDesc(e.target.value)} placeholder="Optional description" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          disabled={savingCategory || !newCatName.trim()}
                          onClick={async () => {
                            try {
                              setSavingCategory(true)
                              const res = await fetch('/api/categories', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: newCatName.trim(), description: newCatDesc || undefined }),
                              })
                              const json = await res.json()
                              if (!res.ok) {
                                alert(json?.error || 'Failed to create category')
                                return
                              }
                              // refresh categories and select the new one
                              await refetchCategories()
                              setFormData(prev => ({ ...prev, categoryId: json.data.id }))
                              setAddCatOpen(false)
                              setNewCatName("")
                              setNewCatDesc("")
                            } catch (e) {
                              console.error(e)
                              alert('Failed to create category')
                            } finally {
                              setSavingCategory(false)
                            }
                          }}
                        >{savingCategory ? 'Saving…' : 'Save Category'}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                <p className="text-xs text-muted-foreground">Can’t find a category? Click “Add Category”.</p>
              </div>
            </div>

            {/* SKU and Barcode */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU *</Label>
                {productId ? (
                  <div className="space-y-1">
                    <Input
                      id="sku"
                      value={formData.sku}
                      readOnly
                      placeholder="Product SKU"
                      required
                    />
                    <p className="text-xs text-muted-foreground">SKU cannot be changed after creation.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex gap-2">
                      <Input
                        id="sku"
                        value={formData.sku}
                        onChange={(e) => handleInputChange('sku', e.target.value)}
                        placeholder="Product SKU"
                        required
                        className={skuDuplicate ? 'border-red-500 focus:ring-red-500' : ''}
                      />
                      <Button type="button" variant="outline" onClick={generateSKU} size="sm">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    {/* SKU Duplicate Warning */}
                    {skuDuplicate && (
                      <div className="p-2 bg-red-50 border border-red-200 rounded-md">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-red-800">
                              SKU already exists{skuDuplicate.status === 'deleted' ? ' (Deleted Product)' : ''}
                            </p>
                            <p className="text-xs text-red-700 truncate">
                              {skuDuplicate.name} • Stock: {skuDuplicate.stockQuantity}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            {skuDuplicate.status === 'deleted' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-xs h-6 border-green-300 text-green-700 hover:bg-green-50"
                                onClick={() => setRestoreProduct(skuDuplicate)}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Restore
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-xs h-6"
                                onClick={() => router.push(`${redirectTo.includes('/staff') ? '/staff/inventory' : '/admin/inventory'}/${skuDuplicate.id}`)}
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="barcode">Barcode</Label>
                {productId ? (
                  <div className="flex gap-2 items-center">
                    <Input id="barcode" value={formData.barcode} readOnly placeholder="No barcode" />
                    <Button type="button" variant="outline" onClick={handlePrintBarcode} size="sm" disabled={!formData.barcode}>
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Select value={barcodeMode} onValueChange={(v: BarcodeMode) => {
                      setBarcodeMode(v)
                      if (v === 'scan') {
                        // Clear any generated/manual value from the visible field and preview until a scan happens
                        setScanInput("")
                        handleInputChange('barcode', '')
                        setTimeout(() => scanInputRef.current?.focus(), 0)
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Barcode mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="generate">Generate new</SelectItem>
                        <SelectItem value="scan">Scan existing</SelectItem>
                        <SelectItem value="manual">Enter manually</SelectItem>
                      </SelectContent>
                    </Select>
                    {barcodeMode === 'generate' && (
                      <div className="flex gap-2 items-center">
                        <Input id="barcode" value={formData.barcode} onChange={(e) => handleInputChange('barcode', e.target.value)} placeholder="Generated barcode" readOnly />
                        <Button type="button" variant="outline" onClick={handleGenerateBarcode} size="sm">
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="outline" onClick={handlePrintBarcode} size="sm" disabled={!formData.barcode}>
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {barcodeMode === 'manual' && (
                      <Input
                        id="barcode-manual"
                        value={formData.barcode}
                        onChange={(e) => handleInputChange('barcode', e.target.value)}
                        onBlur={(e) => checkExternalProduct(e.target.value)}
                        placeholder="Enter barcode"
                      />
                    )}
                    {barcodeMode === 'scan' && (
                      <div className="space-y-2">
                        <Input
                          id="barcode-scan"
                          ref={scanInputRef}
                          value={scanInput}
                          onChange={(e) => {
                            const v = e.target.value
                            setScanInput(v)
                            // Auto-commit after short pause; no Enter needed
                            if (scanIdleTimer.current) window.clearTimeout(scanIdleTimer.current)
                            scanIdleTimer.current = window.setTimeout(() => {
                              const val = v.trim()
                              if (val) {
                                handleInputChange('barcode', val)
                                checkExternalProduct(val)
                              }
                            }, 200)
                          }}
                          placeholder="Focus here and scan with your USB scanner..."
                          autoFocus
                        />
                        <p className="text-xs text-muted-foreground">Scans commit automatically; no need to press Enter.</p>
                      </div>
                    )}
                  </div>
                )}
                {/* Barcode Duplicate Warning */}
                {barcodeDuplicate && !productId && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded-md mt-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-800">
                          Barcode already exists{barcodeDuplicate.status === 'deleted' ? ' (Deleted Product)' : ''}
                        </p>
                        <p className="text-xs text-red-700 truncate">
                          {barcodeDuplicate.name} • SKU: {barcodeDuplicate.sku}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {barcodeDuplicate.status === 'deleted' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-xs h-6 border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() => setRestoreProduct(barcodeDuplicate)}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Restore
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-xs h-6"
                            onClick={() => router.push(`${redirectTo.includes('/staff') ? '/staff/inventory' : '/admin/inventory'}/${barcodeDuplicate.id}`)}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Barcode preview */}
            {formData.barcode && (
              <div className="mt-2 border rounded-md p-3 bg-white flex items-center justify-center">
                <svg ref={barcodeRef} />
              </div>
            )}

            {/* Pricing */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="costPrice">Cost Price *</Label>
                <Input
                  id="costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.costPrice === 0 ? '' : formData.costPrice}
                  onChange={(e) => handleInputChange('costPrice', parseFloat(e.target.value) || 0)}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sellingPrice">Selling Price *</Label>
                <div className="relative">
                  <Input
                    id="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.sellingPrice === 0 ? '' : formData.sellingPrice}
                    onChange={(e) => handleInputChange('sellingPrice', parseFloat(e.target.value) || 0)}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    placeholder="0.00"
                    required
                  />
                  {profitData && (
                    <div className="absolute -bottom-8 left-0 bg-green-100 border border-green-300 rounded-md p-2 text-xs shadow-lg z-10">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="font-medium">Profit: {formatCurrency(profitData.profit)}</span>
                        <span className="text-green-700">({profitData.margin}% margin)</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxPercent">Tax (%)</Label>
                <div className="relative">
                  <Input
                    id="taxPercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.taxPercent}
                    onChange={(e) => handleInputChange('taxPercent', parseFloat(e.target.value) || 0)}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    placeholder={settings?.default_tax_percent ? `Default: ${settings.default_tax_percent}%` : "0.00"}
                  />
                  <div className="absolute -bottom-8 left-0 bg-blue-100 border border-blue-300 rounded-md p-2 text-xs shadow-lg z-10">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="font-medium">Final Price w/ Tax: {formatCurrency(finalPriceWithTax)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stock Levels */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="stockQuantity">Current Stock *</Label>
                <Input
                  id="stockQuantity"
                  type="number"
                  min="0"
                  value={formData.stockQuantity === 0 ? '' : formData.stockQuantity}
                  onChange={(e) => handleInputChange('stockQuantity', parseInt(e.target.value) || 0)}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  placeholder="0"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="minStockLevel">Min Stock Level</Label>
                <Input
                  id="minStockLevel"
                  type="number"
                  min="0"
                  value={formData.minStockLevel === 0 ? '' : formData.minStockLevel}
                  onChange={(e) => handleInputChange('minStockLevel', parseInt(e.target.value) || 0)}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Summary Calculations */}
            {(formData.costPrice > 0 || formData.sellingPrice > 0 || formData.stockQuantity > 0) && (
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-blue-800 text-lg">Calculations Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Profit per unit:</span>
                        <span className="font-semibold">
                          {profitData ? formatCurrency(profitData.profit) : formatCurrency(0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Profit margin:</span>
                        <span className="font-semibold">
                          {profitData ? `${profitData.margin}%` : '0%'}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Inventory value (cost):</span>
                        <span className="font-semibold">{formatCurrency(inventoryValue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Inventory value (retail):</span>
                        <span className="font-semibold">{formatCurrency(retailValue)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {productId ? 'Update Product' : 'Add Product'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              {productId && allowDelete && (
                <Button
                  type="button"
                  variant="outline"
                  className="bg-white text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  onClick={handleDeleteClick}
                  disabled={deleting}
                >
                  {deleting ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete
                </Button>
              )}
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
              <DialogContent className="bg-white">
                <DialogHeader>
                  <DialogTitle>Delete Product</DialogTitle>
                  <DialogDescription>
                    {categoryWillBeEmpty ? (
                      <>
                        <span className="text-orange-500 font-medium">Warning:</span> Deleting this product will leave its category empty.
                        The empty category will also be deleted. You can create the category again later if needed.
                      </>
                    ) : (
                      'Are you sure you want to delete this product? This action cannot be undone.'
                    )}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" className="bg-white" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-white text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    onClick={handleDeleteConfirm}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting...' : categoryWillBeEmpty ? 'Delete Product & Category' : 'Delete Product'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </form>
        </CardContent>
      </Card>

      {/* Edit Confirmation Dialog */}
      <Dialog open={showEditConfirm} onOpenChange={setShowEditConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              Confirm Product Changes
            </DialogTitle>
            <DialogDescription>
              You are about to make the following changes. Please confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {pendingChanges.map((change, index) => (
              <div key={index} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900">{change.field}</p>
                <div className="flex items-center gap-2 text-sm mt-1">
                  <span className="text-red-600 line-through">
                    {typeof change.from === 'number' ? formatCurrency(change.from) : change.from}
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="text-green-600 font-medium">
                    {typeof change.to === 'number' ? formatCurrency(change.to) : change.to}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEditConfirm(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveProduct}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Confirm Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Product Dialog */}
      <Dialog open={!!restoreProduct} onOpenChange={(open) => !open && setRestoreProduct(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-green-600" />
              Restore Deleted Product?
            </DialogTitle>
            <DialogDescription>
              This product was previously deleted. Would you like to restore it and continue editing?
            </DialogDescription>
          </DialogHeader>
          {restoreProduct && (
            <div className="p-4 bg-gray-50 rounded-lg border">
              <p className="font-medium">{restoreProduct.name}</p>
              <p className="text-sm text-muted-foreground">
                SKU: {restoreProduct.sku}
                {restoreProduct.barcode && ` • Barcode: ${restoreProduct.barcode}`}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Last stock: {restoreProduct.stockQuantity} units •
                Price: {formatCurrency(restoreProduct.sellingPrice)}
              </p>
            </div>
          )}
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRestoreProduct(null)}
              disabled={restoring}
            >
              Ignore
            </Button>
            <Button
              type="button"
              onClick={handleRestoreProduct}
              disabled={restoring}
              className="bg-green-600 hover:bg-green-700"
            >
              {restoring ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore & Edit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Similar Products Dialog */}
      <Dialog open={showSimilarNames} onOpenChange={setShowSimilarNames}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Similar Products Found
            </DialogTitle>
            <DialogDescription>
              The following products have similar names. You may want to edit an existing product instead.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 -mr-2">
            {similarNames.map((product) => (
              <div
                key={product.id}
                className={`p-3 border rounded-lg mb-2 ${product.status === 'deleted' ? 'bg-red-50 border-red-200' : 'bg-gray-50'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      SKU: {product.sku} • Stock: {product.stockQuantity}
                      {product.status === 'deleted' && (
                        <span className="ml-2 text-red-600 font-medium">(Deleted)</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-3">
                    {product.status === 'deleted' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-green-300 text-green-700 hover:bg-green-50"
                        onClick={() => {
                          setShowSimilarNames(false)
                          setRestoreProduct(product)
                        }}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Restore
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          router.push(`${redirectTo.includes('/staff') ? '/staff/inventory' : '/admin/inventory'}/${product.id}`)
                        }}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowSimilarNames(false)}
            >
              Continue Adding New Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exact Match Warning Dialog - Auto-shows for 90%+ similar names */}
      <Dialog open={!!exactMatchWarning} onOpenChange={(open) => !open && setExactMatchWarning(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertCircle className="h-5 w-5" />
              Near-Duplicate Product Detected
            </DialogTitle>
            <DialogDescription>
              A product with a very similar name already exists in your inventory. Did you mean to edit this product instead?
            </DialogDescription>
          </DialogHeader>
          {exactMatchWarning && (
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="font-medium text-orange-900">{exactMatchWarning.name}</p>
              <p className="text-sm text-orange-700 mt-1">
                SKU: {exactMatchWarning.sku} • Stock: {exactMatchWarning.stockQuantity}
                {exactMatchWarning.status === 'deleted' && (
                  <span className="ml-2 text-red-600 font-medium">(Deleted)</span>
                )}
              </p>
            </div>
          )}
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExactMatchWarning(null)}
            >
              Ignore, Continue Adding
            </Button>
            {exactMatchWarning?.status === 'deleted' ? (
              <Button
                type="button"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => {
                  setRestoreProduct(exactMatchWarning)
                  setExactMatchWarning(null)
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Restore This Product
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  if (exactMatchWarning) {
                    router.push(`${redirectTo.includes('/staff') ? '/staff/inventory' : '/admin/inventory'}/${exactMatchWarning.id}`)
                  }
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit This Product
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Note: External USB scanners behave like keyboard input; no camera integration needed here.

