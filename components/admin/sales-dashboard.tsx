"use client"

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Search,
  Eye,
  RefreshCw,
  Download,
  Calendar,
  DollarSign,
  ShoppingCart,
  RotateCcw,
} from "lucide-react"
import Receipt from "@/components/receipt"
import { formatCurrency } from "@/lib/utils"

interface Sale {
  id: string
  saleNumber: string
  totalAmount: number
  subtotal: number
  taxAmount: number
  discountAmount: number
  paymentMethod: string
  status: string
  createdAt: string
  cashierId: string
  stripePaymentIntentId?: string | null
  cashier?: {
    id: string
    fullName: string
    username: string
  } | null
  returnInfo?: {
    reason: string
    notes: string | null
    returnedAt: string
  } | null
  saleItems: Array<{
    id: string
    quantity: number
    unitPrice: number
    totalPrice: number
    product: {
      id: string
      name: string
      sku: string
      imagePath?: string | null
    }
  }>
}

interface Return {
  id: string
  reference: string
  reason: string | null
  notes: string | null
  quantity: number
  createdAt: string
  estimatedValue: number
  product: {
    id: string
    name: string
    sku: string
    imagePath?: string | null
    sellingPrice: number
  }
}

export default function SalesDashboard() {
  const [searchTerm, setSearchTerm] = useState("")
  const [returnSearchTerm, setReturnSearchTerm] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<string>("all")
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [range, setRange] = useState<'7d' | '30d' | '1y' | 'custom'>("7d")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [includeItems, setIncludeItems] = useState(false)
  const [includeReturns, setIncludeReturns] = useState(false)
  const [preview, setPreview] = useState<{ headers?: string[]; data?: any[] } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("sales")

  const { data: sales = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const response = await fetch('/api/sales?limit=100', { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch sales')
      const result = await response.json()
      return result.data as Sale[]
    },
    refetchOnMount: 'always',
    staleTime: 0,
  })

  const { data: returns = [], isLoading: returnsLoading, refetch: refetchReturns } = useQuery({
    queryKey: ['returns'],
    queryFn: async () => {
      const response = await fetch('/api/returns?limit=100', { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch returns')
      const result = await response.json()
      return result.data as Return[]
    },
    refetchOnMount: 'always',
    staleTime: 0,
  })

  const filteredSales = sales.filter(sale => {
    const matchesSearch = sale.saleNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.cashierId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.cashier?.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || false
    const matchesPayment = paymentMethod === "all" || sale.paymentMethod.toLowerCase() === paymentMethod.toLowerCase()
    return matchesSearch && matchesPayment
  })

  const filteredReturns = returns.filter(ret => {
    const searchLower = returnSearchTerm.toLowerCase()
    return ret.reference.toLowerCase().includes(searchLower) ||
      ret.product.name.toLowerCase().includes(searchLower) ||
      ret.product.sku.toLowerCase().includes(searchLower) ||
      (ret.reason?.toLowerCase().includes(searchLower) ?? false)
  })

  const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.totalAmount, 0)
  const totalSales = filteredSales.length
  const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0

  const totalReturns = returns.length
  const totalReturnValue = returns.reduce((sum, ret) => sum + ret.estimatedValue, 0)
  const totalReturnedUnits = returns.reduce((sum, ret) => sum + ret.quantity, 0)

  if (loading || returnsLoading) {
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
          <h2 className="text-3xl font-bold tracking-tight">Sales & Returns</h2>
          <p className="text-muted-foreground">View all sales transactions and returns</p>
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={() => { refetch(); refetchReturns(); }}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setExportOpen(true)}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="sales" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Sales ({totalSales})
          </TabsTrigger>
          <TabsTrigger value="returns" className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Returns ({totalReturns})
          </TabsTrigger>
        </TabsList>

        {/* Sales Tab */}
        <TabsContent value="sales" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
                <p className="text-xs text-muted-foreground">
                  From {filteredSales.length} sales
                </p>
              </CardContent>
            </Card>        <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalSales}</div>
                <p className="text-xs text-muted-foreground">
                  Transactions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Sale</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(averageSale)}</div>
                <p className="text-xs text-muted-foreground">
                  Per transaction
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
                      placeholder="Search by sale number or cashier..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Payment Method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payment Methods</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Sales Table */}
          <Card>
            <CardHeader>
              <CardTitle>Sales Transactions ({filteredSales.length})</CardTitle>
              <CardDescription>
                All sales transactions with details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sale Number</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Cashier</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.map((sale) => (
                    <TableRow key={sale.id} className={sale.status === 'REFUNDED' ? 'bg-orange-50 dark:bg-orange-950/20' : ''}>
                      <TableCell>
                        <div className="font-medium">{sale.saleNumber}</div>
                        {sale.stripePaymentIntentId && (
                          <div className="text-xs text-muted-foreground font-mono">
                            {sale.stripePaymentIntentId}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{new Date(sale.createdAt).toLocaleDateString()}</div>
                          <div className="text-muted-foreground">
                            {new Date(sale.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{sale.cashier?.fullName || sale.cashierId}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-2 overflow-hidden">
                            {sale.saleItems.slice(0, 3).map((item) => (
                              <div key={item.id} className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-gray-100 overflow-hidden">
                                {item.product.imagePath ? (
                                  <img src={item.product.imagePath} alt={item.product.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-[8px] text-gray-500">No img</div>
                                )}
                              </div>
                            ))}
                            {sale.saleItems.length > 3 && (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-white bg-gray-100 text-xs font-medium text-gray-500">
                                +{sale.saleItems.length - 3}
                              </div>
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            ({sale.saleItems.length})
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {sale.paymentMethod}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {sale.status === 'COMPLETED' && <Badge variant="default" className="bg-green-600 w-fit">Completed</Badge>}
                          {sale.status === 'REFUNDED' && (
                            <>
                              <Badge variant="destructive" className="w-fit">Returned</Badge>
                              {sale.returnInfo?.reason && (
                                <span className="text-xs text-muted-foreground">
                                  {sale.returnInfo.reason}
                                </span>
                              )}
                            </>
                          )}
                          {sale.status === 'CANCELLED' && <Badge variant="secondary" className="w-fit">Cancelled</Badge>}
                          {sale.status === 'PENDING' && <Badge variant="outline" className="w-fit">Pending</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {sale.status === 'REFUNDED' ? (
                          <span className="text-orange-600 line-through">{formatCurrency(sale.totalAmount)}</span>
                        ) : (
                          formatCurrency(sale.totalAmount)
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedSale(sale)
                            setShowReceipt(true)
                          }}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredSales.length === 0 && (
                <div className="text-center py-12">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No sales found</h3>
                  <p className="text-muted-foreground">
                    Try adjusting your search or filters
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Returns Tab */}
        <TabsContent value="returns" className="space-y-6">
          {/* Returns Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalReturns}</div>
                <p className="text-xs text-muted-foreground">
                  Return transactions
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Return Value</CardTitle>
                <DollarSign className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{formatCurrency(totalReturnValue)}</div>
                <p className="text-xs text-muted-foreground">
                  Estimated value returned
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Units Returned</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalReturnedUnits}</div>
                <p className="text-xs text-muted-foreground">
                  Items returned to stock
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Returns Search */}
          <Card>
            <CardHeader>
              <CardTitle>Search Returns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by reference, product name, SKU, or reason..."
                  value={returnSearchTerm}
                  onChange={(e) => setReturnSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Returns Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Return Transactions ({filteredReturns.length})</CardTitle>
                <CardDescription>
                  All product returns with details
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const res = await fetch('/api/returns/export?range=30d')
                  const blob = await res.blob()
                  const url = window.URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  const cd = res.headers.get('content-disposition') || ''
                  const match = cd.match(/filename=\"(.+)\"/)
                  a.download = match?.[1] || 'returns_export.csv'
                  document.body.appendChild(a)
                  a.click()
                  a.remove()
                  window.URL.revokeObjectURL(url)
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Est. Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReturns.map((ret) => (
                    <TableRow key={ret.id}>
                      <TableCell className="font-mono text-sm">{ret.reference}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{new Date(ret.createdAt).toLocaleDateString()}</div>
                          <div className="text-muted-foreground">
                            {new Date(ret.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {ret.product.imagePath ? (
                            <div className="h-8 w-8 rounded bg-gray-100 overflow-hidden">
                              <img src={ret.product.imagePath} alt={ret.product.name} className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <div className="h-8 w-8 rounded bg-gray-100 flex items-center justify-center text-[8px] text-gray-500">No img</div>
                          )}
                          <span className="font-medium">{ret.product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{ret.product.sku}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{ret.quantity}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {ret.reason || 'Not specified'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-orange-600">
                        {formatCurrency(ret.estimatedValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredReturns.length === 0 && (
                <div className="text-center py-12">
                  <RotateCcw className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No returns found</h3>
                  <p className="text-muted-foreground">
                    {returnSearchTerm ? 'Try adjusting your search' : 'No return transactions recorded yet'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Receipt Modal */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sale Receipt</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <Receipt sale={selectedSale} />
          )}
        </DialogContent>
      </Dialog>

      {/* Export Modal with Preview */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Export Sales CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <Label className="mb-2 block">Date Range</Label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { k: '7d', label: 'Last 7 days' },
                  { k: '30d', label: 'Last 30 days' },
                  { k: '1y', label: 'Last 1 year' },
                  { k: 'custom', label: 'Custom' },
                ] as const).map(o => (
                  <Button
                    key={o.k}
                    type="button"
                    variant={range === o.k ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRange(o.k)}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
              {range === 'custom' && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="startDate">Start</Label>
                    <Input id="startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="endDate">End</Label>
                    <Input id="endDate" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label className="mb-2 block">Include in CSV</Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Item breakdown (single cell)</span>
                  <Switch checked={includeItems} onCheckedChange={(v: boolean) => setIncludeItems(v)} />
                </div>
                <div className="flex items-center justify-between">
                  <span>Include Returns</span>
                  <Switch checked={includeReturns} onCheckedChange={(v: boolean) => setIncludeReturns(v)} />
                </div>
              </div>
            </div>

            <div className="border rounded-md">
              <div className="p-3 flex items-center justify-between">
                <div className="text-sm font-medium">Preview</div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const params = new URLSearchParams()
                      params.set('range', range)
                      params.set('format', 'json')
                      if (range === 'custom') {
                        if (startDate) params.set('start', startDate)
                        if (endDate) params.set('end', endDate)
                      }
                      const fields: string[] = []
                      if (includeItems) fields.push('items')
                      if (includeReturns) fields.push('returns')
                      if (fields.length) params.set('fields', fields.join(','))
                      setPreviewLoading(true)
                      try {
                        const res = await fetch(`/api/sales/export?${params.toString()}`)
                        const json = await res.json()
                        setPreview(json)
                      } finally {
                        setPreviewLoading(false)
                      }
                    }}
                  >
                    {previewLoading ? 'Loading…' : 'Load Preview'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const params = new URLSearchParams()
                      params.set('range', range)
                      params.set('format', 'json')
                      if (range === 'custom') {
                        if (startDate) params.set('start', startDate)
                        if (endDate) params.set('end', endDate)
                      }
                      const fields: string[] = []
                      if (includeItems) fields.push('items')
                      if (includeReturns) fields.push('returns')
                      if (fields.length) params.set('fields', fields.join(','))

                      try {
                        const res = await fetch(`/api/sales/export?${params.toString()}`)
                        if (!res.ok) throw new Error('Failed to fetch data')
                        const json = await res.json()

                        let headers: string[] = []
                        let data: any[] = []

                        if (Array.isArray(json?.headers) && json.headers.length > 0) {
                          headers = json.headers
                          data = json.data || []
                        } else if (Array.isArray(json?.data) && json.data.length > 0) {
                          headers = Object.keys(json.data[0])
                          data = json.data
                        }

                        if (headers.length === 0) {
                          alert('No data to export')
                          return
                        }

                        const doc = new jsPDF({ orientation: 'landscape' })

                        // Report Title
                        doc.setFontSize(16)
                        doc.setFont('helvetica', 'bold')
                        doc.text(json.reportTitle || 'Sales Report', 14, 15)

                        // Date Range
                        doc.setFontSize(10)
                        doc.setFont('helvetica', 'normal')
                        doc.text(json.dateRange || '', 14, 22)
                        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28)

                        autoTable(doc, {
                          startY: 35,
                          head: [headers],
                          body: data.map(row => headers.map(h => {
                            const val = row[h]
                            // Highlight returns
                            return val
                          })),
                          styles: { fontSize: 7, cellPadding: 2 },
                          headStyles: { fillColor: [66, 66, 66] },
                          didParseCell: (hookData) => {
                            // Highlight return rows with red background
                            if (hookData.section === 'body') {
                              const rowData = data[hookData.row.index]
                              if (rowData && rowData['Status'] === 'RETURN') {
                                hookData.cell.styles.fillColor = [255, 230, 230]
                                hookData.cell.styles.textColor = [180, 0, 0]
                              }
                            }
                          }
                        })

                        // Add summary section at bottom
                        if (json.summary) {
                          const finalY = (doc as any).lastAutoTable?.finalY || 150
                          const pageWidth = doc.internal.pageSize.getWidth()
                          const rightX = pageWidth - 14

                          doc.setFontSize(9)
                          doc.setFont('helvetica', 'normal')

                          let summaryY = finalY + 10

                          doc.text(`Sales Amount: ¥${Number(json.summary.salesAmount).toFixed(1)}`, rightX, summaryY, { align: 'right' })
                          summaryY += 6
                          doc.text(`Sales Tax (10%): ¥${Number(json.summary.salesTax).toFixed(1)}`, rightX, summaryY, { align: 'right' })
                          summaryY += 6

                          // Returns line (red if > 0)
                          const returnsAmt = Number(json.summary.returnsAmount || 0)
                          if (returnsAmt > 0) {
                            doc.setTextColor(180, 0, 0)
                          }
                          doc.text(`- Returns: ¥-${returnsAmt.toFixed(1)}`, rightX, summaryY, { align: 'right' })
                          doc.setTextColor(0, 0, 0)
                          summaryY += 6

                          // Draw box around Total
                          doc.setFont('helvetica', 'bold')
                          const totalText = `[Total]: ¥${Number(json.summary.netTotal).toFixed(1)}`
                          const textWidth = doc.getTextWidth(totalText)
                          doc.rect(rightX - textWidth - 4, summaryY - 4, textWidth + 8, 8)
                          doc.text(totalText, rightX, summaryY, { align: 'right' })
                        }

                        doc.save(`sales_report_${new Date().toISOString().slice(0, 10)}.pdf`)
                      } catch (e) {
                        console.error(e)
                        alert('Failed to generate PDF')
                      }
                    }}
                  >
                    Download PDF
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const params = new URLSearchParams()
                      params.set('range', range)
                      if (range === 'custom') {
                        if (startDate) params.set('start', startDate)
                        if (endDate) params.set('end', endDate)
                      }
                      const fields: string[] = []
                      if (includeItems) fields.push('items')
                      if (includeReturns) fields.push('returns')
                      if (fields.length) params.set('fields', fields.join(','))
                      const res = await fetch(`/api/sales/export?${params.toString()}`)
                      const blob = await res.blob()
                      const url = window.URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      const cd = res.headers.get('content-disposition') || ''
                      const match = cd.match(/filename=\"(.+)\"/)
                      a.download = match?.[1] || 'sales_export.csv'
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      window.URL.revokeObjectURL(url)
                    }}
                  >
                    Download CSV
                  </Button>
                </div>
              </div>
              <div className="max-h-[50vh] overflow-auto">
                {preview?.data && preview?.headers ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {preview.headers.map((h) => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.data.slice(0, 20).map((row, idx) => (
                        <TableRow key={idx}>
                          {preview.headers!.map((h) => (
                            <TableCell key={h}>{String(row[h] ?? '')}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">Click Load Preview to see the first rows.</div>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setExportOpen(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
