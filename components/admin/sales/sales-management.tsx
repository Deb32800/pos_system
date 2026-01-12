"use client"

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  ShoppingCart,
  Search,
  MoreHorizontal,
  Eye,
  RefreshCw,
  Download,
  Calendar,
  TrendingUp,
  DollarSign,
} from "lucide-react"
import AdminLayout from "@/components/admin/admin-layout"
import { useSettings } from "@/components/settings-provider"

interface Sale {
  id: string
  sale_number: string
  total_amount: number
  tax_amount: number
  discount_amount: number
  payment_method: string
  status: string
  notes: string
  created_at: string
  users: { id: string; full_name: string } | null
  sale_items: Array<{
    id: string
    quantity: number
    unit_price: number
    total_price: number
    products: { id: string; name: string; sku: string } | null
  }>
}

interface Staff {
  id: string
  full_name: string
}

interface SalesManagementProps {
  sales: Sale[]
  staff: Staff[]
}

export default function SalesManagement({ sales = [], staff = [] }: SalesManagementProps) {
  const { formatCurrency } = useSettings()
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedStaff, setSelectedStaff] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [paymentFilter, setPaymentFilter] = useState<string>("all")
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportRange, setExportRange] = useState<'7d'|'30d'|'1y'|'custom'>('30d')
  const [exportType, setExportType] = useState<'transactions'|'line_items'|'payments'|'staff'|'categories'>('transactions')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [opts, setOpts] = useState({ cogs: true, profit: true, items: false, discounts: true, taxes: true, cashier: false, category: false })
  const [preview, setPreview] = useState<any[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewFull, setPreviewFull] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [refundLoading, setRefundLoading] = useState(false)
  const [localSales, setLocalSales] = useState<Sale[]>(sales)
  const [scrollThumb, setScrollThumb] = useState<{ left: number; width: number }>({ left: 0, width: 0 })
  const tableScrollRef = useRef<HTMLDivElement | null>(null)

  // Update local sales when props change
  useEffect(() => {
    setLocalSales(sales)
  }, [sales])

  // Handle refund
  const handleRefund = async (saleId: string) => {
    if (!confirm('Are you sure you want to process this refund? This will restore all items to stock.')) {
      return
    }
    setRefundLoading(true)
    try {
      const res = await fetch(`/api/sales/${saleId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to process refund')
        return
      }
      // Update local state
      setLocalSales(prev => prev.map(s => s.id === saleId ? { ...s, status: 'refunded' } : s))
      setSelectedSale(null)
      alert('Refund processed successfully. Stock has been restored.')
    } catch (error) {
      console.error('Refund error:', error)
      alert('Failed to process refund')
    } finally {
      setRefundLoading(false)
    }
  }

  const updateScrollHints = () => {
    const el = tableScrollRef.current
    if (!el) return
    const { scrollLeft, clientWidth, scrollWidth } = el
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth)
    const widthPct = scrollWidth > 0 ? (clientWidth / scrollWidth) * 100 : 100
    const maxLeftPct = Math.max(0, 100 - widthPct)
    const leftPct = scrollWidth - clientWidth > 0 ? (scrollLeft / (scrollWidth - clientWidth)) * maxLeftPct : 0
    setScrollThumb({ left: leftPct, width: widthPct })
  }

  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const onScroll = () => updateScrollHints()
    const onResize = () => updateScrollHints()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    updateScrollHints()
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [exportOpen, preview])

  // Auto-load preview when options change
  useEffect(() => {
    if (!exportOpen) return
    let cancelled = false
    const load = async () => {
      setPreviewLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('range', exportRange)
        params.set('format', 'json')
        params.set('type', exportType)
        if (exportRange === 'custom') {
          if (start) params.set('start', start)
          if (end) params.set('end', end)
        }
        if (exportType === 'transactions') {
          const fields: string[] = []
          if (opts.cogs) fields.push('cogs')
          if (opts.profit) fields.push('profit')
          if (opts.items) fields.push('items')
          if (opts.cashier) fields.push('cashier')
          if (opts.category) fields.push('category')
          if (opts.discounts) fields.push('discounts')
          if (opts.taxes) fields.push('tax')
          if (fields.length) params.set('fields', fields.join(','))
        }
        const res = await fetch(`/api/sales/export?${params.toString()}`)
        const json = await res.json()
        if (cancelled) return
        const data = Array.isArray(json.data) ? json.data.slice(0, 10) : []
        setPreview(data)
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [exportOpen, exportType, exportRange, start, end, opts])

  const filteredSales = (localSales || []).filter((sale) => {
    const matchesSearch =
      sale.sale_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.users?.full_name?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStaff = selectedStaff === "all" || sale.users?.id === selectedStaff
    const matchesStatus = statusFilter === "all" || sale.status === statusFilter
    const matchesPayment = paymentFilter === "all" || sale.payment_method === paymentFilter

    return matchesSearch && matchesStaff && matchesStatus && matchesPayment
  })

  // Calculate summary statistics
  const totalRevenue = filteredSales.reduce(
    (sum, sale) => sum + Number.parseFloat(sale.total_amount?.toString() || "0"),
    0,
  )
  const totalSales = filteredSales.length
  const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default">Completed</Badge>
      case "pending":
        return <Badge variant="secondary">Pending</Badge>
      case "refunded":
        return <Badge variant="destructive">Refunded</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPaymentMethodBadge = (method: string) => {
    const variants = {
      cash: "default" as const,
      card: "secondary" as const,
      digital: "outline" as const,
    }
    return <Badge variant={variants[method as keyof typeof variants] || "outline"}>{method}</Badge>
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Sales Management</h2>
            <p className="text-muted-foreground">View and manage all sales transactions</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button variant="outline">
              <Calendar className="mr-2 h-4 w-4" />
              Date Range
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">From {totalSales} sales</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSales}</div>
              <p className="text-xs text-muted-foreground">Filtered results</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Sale</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(averageSale)}</div>
              <p className="text-xs text-muted-foreground">Per transaction</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Search and filter sales transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by sale number or staff name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {(staff || []).map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All Payments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="digital">Digital</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Sales Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Sales Transactions ({filteredSales.length})</CardTitle>
                <CardDescription>
                  {filteredSales.length} of {(localSales || []).length} sales
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredSales.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sale #</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono text-sm">{sale.sale_number}</TableCell>
                      <TableCell>{sale.users?.full_name || "Unknown"}</TableCell>
                      <TableCell>{new Date(sale.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {(sale.sale_items || []).length} item{(sale.sale_items || []).length !== 1 ? "s" : ""}
                        </span>
                      </TableCell>
                      <TableCell>{getPaymentMethodBadge(sale.payment_method)}</TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(Number.parseFloat(sale.total_amount?.toString() || "0"))}
                      </TableCell>
                      <TableCell>{getStatusBadge(sale.status)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedSale(sale)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {sale.status === "completed" && (
                              <DropdownMenuItem 
                                className="text-orange-600"
                                onClick={() => handleRefund(sale.id)}
                                disabled={refundLoading}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {refundLoading ? 'Processing...' : 'Refund'}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No sales found</h3>
                <p className="text-muted-foreground">
                  {searchTerm || selectedStaff !== "all" || statusFilter !== "all" || paymentFilter !== "all"
                    ? "Try adjusting your filters"
                    : "No sales have been recorded yet"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sale Details Dialog */}
        <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Sale Details</DialogTitle>
              <DialogDescription>
                {selectedSale &&
                  `Sale #${selectedSale.sale_number} - ${new Date(selectedSale.created_at).toLocaleString()}`}
              </DialogDescription>
            </DialogHeader>
            {selectedSale && (
              <div className="space-y-6">
                {/* Sale Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Staff Member</label>
                    <p className="text-sm">{selectedSale.users?.full_name || "Unknown"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Payment Method</label>
                    <p className="text-sm">{selectedSale.payment_method}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <div className="mt-1">{getStatusBadge(selectedSale.status)}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Total Amount</label>
                    <p className="text-sm font-semibold">
                      {formatCurrency(Number.parseFloat(selectedSale.total_amount?.toString() || "0"))}
                    </p>
                  </div>
                </div>

                {/* Sale Items */}
                <div>
                  <h4 className="font-medium mb-3">Items Purchased</h4>
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Unit Price</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(selectedSale?.sale_items || []).map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.products?.name || "Unknown Product"}</TableCell>
                            <TableCell className="font-mono text-sm">{item.products?.sku || "N/A"}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>{formatCurrency(Number.parseFloat(item.unit_price?.toString() || "0"))}</TableCell>
                            <TableCell>{formatCurrency(Number.parseFloat(item.total_price?.toString() || "0"))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Notes */}
                {selectedSale.notes && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Notes</label>
                    <p className="text-sm mt-1">{selectedSale.notes}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSelectedSale(null)}>
                    Close
                  </Button>
                  {selectedSale.status === "completed" && (
                    <Button 
                      variant="destructive" 
                      onClick={() => handleRefund(selectedSale.id)}
                      disabled={refundLoading}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${refundLoading ? 'animate-spin' : ''}`} />
                      {refundLoading ? 'Processing...' : 'Process Refund'}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Export Dialog */}
        <Dialog open={exportOpen} onOpenChange={setExportOpen}>
          <DialogContent className={previewFull ? "w-[98vw] max-w-[98vw] h-[90vh]" : "w-[95vw] max-w-5xl"}>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Export Sales CSV</DialogTitle>
                <Button size="sm" variant="outline" onClick={() => setPreviewFull(v => !v)}>
                  {previewFull ? 'Exit full screen' : 'Full screen'}
                </Button>
              </div>
            </DialogHeader>
            <div className="flex flex-col gap-4" style={{ height: previewFull ? '75vh' : '60vh' }}>
              <div>
                <label className="mb-2 block text-sm font-medium">Export Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {([
                    { k: 'transactions', label: 'Transactions', hint: 'One row per sale' },
                    { k: 'line_items', label: 'Line Items', hint: 'One row per item' },
                    { k: 'payments', label: 'Payments', hint: 'Totals by method' },
                    { k: 'staff', label: 'Staff', hint: 'Totals by cashier' },
                    { k: 'categories', label: 'Categories', hint: 'Totals by category' },
                  ] as const).map(o => (
                    <Button key={o.k} variant={exportType === o.k ? 'default' : 'outline'} size="sm" onClick={() => setExportType(o.k)}>
                      <div className="flex flex-col items-start">
                        <span>{o.label}</span>
                        <span className="text-[10px] text-muted-foreground">{o.hint}</span>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Date Range</label>
                <div className="flex gap-2 flex-wrap">
                  {([
                    { k: '7d', label: 'Last 7 days' },
                    { k: '30d', label: 'Last 30 days' },
                    { k: '1y', label: 'Last 1 year' },
                    { k: 'custom', label: 'Custom' },
                  ] as const).map(o => (
                    <Button key={o.k} variant={exportRange === o.k ? 'default' : 'outline'} size="sm" onClick={() => setExportRange(o.k)}>
                      {o.label}
                    </Button>
                  ))}
                </div>
                {exportRange === 'custom' && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="start">Start</label>
                      <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="end">End</label>
                      <Input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {exportType === 'transactions' && (
                <div>
                  <label className="mb-2 block text-sm font-medium">Columns</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'cogs', label: 'COGS' },
                      { key: 'profit', label: 'Profit & Margin %' },
                      { key: 'items', label: 'Item breakdown' },
                      { key: 'discounts', label: 'Discounts' },
                      { key: 'taxes', label: 'Tax' },
                      { key: 'cashier', label: 'Cashier' },
                      { key: 'category', label: 'Category' },
                    ].map(opt => (
                      <div key={opt.key} className="flex items-center justify-between border rounded px-3 py-2">
                        <span className="text-sm">{opt.label}</span>
                        <input
                          type="checkbox"
                          checked={(opts as any)[opt.key]}
                          onChange={(e) => setOpts(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {exportType !== 'transactions' && (
                <div className="border rounded-md p-3 text-sm text-muted-foreground">
                  {exportType === 'line_items' && (
                    <ul className="list-disc pl-5 space-y-1">
                      <li>One row per sold item</li>
                      <li>Columns: Sale #, Date/Time, Product, SKU, Category, Qty, Unit Price, Line Total, Cashier</li>
                    </ul>
                  )}
                  {exportType === 'payments' && (
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Totals by payment method</li>
                      <li>Columns: Method, Sales Count, Total Amount, Avg Sale</li>
                    </ul>
                  )}
                  {exportType === 'staff' && (
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Totals by cashier</li>
                      <li>Columns: Cashier, Sales Count, Total Amount, Avg Sale</li>
                    </ul>
                  )}
                  {exportType === 'categories' && (
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Totals by product category</li>
                      <li>Columns: Category, Units Sold, Revenue, COGS, Gross Profit, Margin %</li>
                    </ul>
                  )}
                  <p className="text-xs mt-2">Note: CSVs include a UTF-8 BOM for Excel compatibility.</p>
                </div>
              )}

              <div className="border rounded-md flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between px-3 py-2">
                  <label className="text-sm font-medium">Preview</label>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted-foreground">
                      {previewLoading ? 'Loading preview…' : preview && preview.length ? `${preview.length} rows` : 'No preview loaded'}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setPreviewFull(v => !v)}>
                      {previewFull ? 'Exit full' : 'Full screen'}
                    </Button>
                  </div>
                </div>
                <div className="relative flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden">
                  {preview && preview.length > 0 ? (
                    <Table
                      className="!w-auto min-w-max"
                      wrapperClassName="[touch-action:pan-x] overflow-x-scroll overflow-y-visible"
                      wrapperStyle={{ WebkitOverflowScrolling: 'touch' as any, overscrollBehaviorX: 'contain' as any }}
                      wrapperRef={tableScrollRef}
                    >
                      <TableHeader className="sticky top-0 z-10 bg-background">
                        <TableRow>
                          {Object.keys(preview[0]).map((h, i) => (
                            <TableHead
                              key={h}
                              className={"whitespace-nowrap text-xs sm:text-sm " + (i === 0 ? 'sticky left-0 bg-background z-20 shadow-[1px_0_0_0_var(--border)]' : '')}
                            >
                              {h}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.map((row, idx) => (
                          <TableRow key={idx}>
                            {Object.keys(preview[0]).map((h, i) => (
                              <TableCell
                                key={h}
                                className={"whitespace-nowrap text-xs sm:text-sm " + (i === 0 ? 'sticky left-0 bg-background z-10 shadow-[1px_0_0_0_var(--border)]' : '')}
                              >
                                {String(row[h] ?? '')}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="px-3 py-6 text-sm text-muted-foreground">{previewLoading ? 'Loading preview…' : 'No preview available'}</div>
                  )}
                  {/* Gradient scroll hints */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent"
                    style={{ opacity: canScrollLeft ? 1 : 0, transition: 'opacity 150ms' }}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent"
                    style={{ opacity: canScrollRight ? 1 : 0, transition: 'opacity 150ms' }}
                  />
                  {/* Custom bottom scrollbar indicator */}
                  <div className="pointer-events-none absolute left-2 right-2 bottom-2 h-1 rounded-full bg-muted/30">
                    <div
                      className="absolute top-0 h-1 rounded-full bg-muted-foreground/60"
                      style={{ width: `${scrollThumb.width}%`, left: `${scrollThumb.left}%`, transition: 'width 120ms, left 120ms' }}
                    />
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-background border-t pt-3 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
                <Button variant="outline" onClick={async () => {
                  const params = new URLSearchParams()
                  params.set('range', exportRange)
                  params.set('type', exportType)
                  params.set('format', 'json')
                  if (exportRange === 'custom') {
                    if (start) params.set('start', start)
                    if (end) params.set('end', end)
                  }
                  if (exportType === 'transactions') {
                    const fields: string[] = []
                    if (opts.cogs) fields.push('cogs')
                    if (opts.profit) fields.push('profit')
                    if (opts.items) fields.push('items')
                    if (opts.cashier) fields.push('cashier')
                    if (opts.category) fields.push('category')
                    if (opts.discounts) fields.push('discounts')
                    if (opts.taxes) fields.push('tax')
                    if (fields.length) params.set('fields', fields.join(','))
                  }
                  
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
                    doc.text(`Sales Report: ${exportType.toUpperCase()}`, 14, 15)
                    doc.setFontSize(10)
                    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22)
                    
                    autoTable(doc, {
                      startY: 25,
                      head: [headers],
                      body: data.map(row => headers.map(h => row[h])),
                      styles: { fontSize: 7, cellPadding: 2 },
                      headStyles: { fillColor: [66, 66, 66] }
                    })
                    
                    doc.save(`sales_${exportType}_${new Date().toISOString().slice(0,10)}.pdf`)
                    setExportOpen(false)
                  } catch (e) {
                    console.error(e)
                    alert('Failed to generate PDF')
                  }
                }}>Download PDF</Button>
                <Button onClick={async () => {
                  const params = new URLSearchParams()
                  params.set('range', exportRange)
                  params.set('type', exportType)
                  if (exportRange === 'custom') {
                    if (start) params.set('start', start)
                    if (end) params.set('end', end)
                  }
                  if (exportType === 'transactions') {
                    const fields: string[] = []
                    if (opts.cogs) fields.push('cogs')
                    if (opts.profit) fields.push('profit')
                    if (opts.items) fields.push('items')
                    if (opts.cashier) fields.push('cashier')
                    if (opts.category) fields.push('category')
                    if (opts.discounts) fields.push('discounts')
                    if (opts.taxes) fields.push('tax')
                    if (fields.length) params.set('fields', fields.join(','))
                  }
                  const res = await fetch(`/api/sales/export?${params.toString()}`)
                  const blob = await res.blob()
                  const url = window.URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  const cd = res.headers.get('content-disposition') || ''
                  const m = cd.match(/filename=\"(.+)\"/)
                  a.download = m?.[1] || 'sales_export.csv'
                  document.body.appendChild(a)
                  a.click()
                  a.remove()
                  window.URL.revokeObjectURL(url)
                  setExportOpen(false)
                }}>Download CSV</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  )
}
