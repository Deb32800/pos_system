"use client"

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts"
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Package,
  Download,
  RefreshCw,
  Calendar,
  AlertTriangle,
} from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface DashboardMetrics {
  overview: {
    totalProducts: number
    totalCategories: number
    totalSales: number
    lowStockCount: number
    totalRevenue: number
    totalDiscounts: number
    inventoryValue: number
    retailValue: number
    averageOrderValue?: number
    grossProfit?: number
    profitMargin?: number
    revenueChangePct?: number
    salesChangePct?: number
    periodStart?: string | Date
    periodEnd?: string | Date
  }
  topProducts: Array<{
    product: {
      id: string
      name: string
      sku: string
      category: { name: string }
    }
    totalQuantity: number
    totalRevenue: number
    salesCount: number
  }>
  salesByPaymentMethod: Array<{
    paymentMethod: string
    _sum: { totalAmount: number }
    _count: { id: number }
  }>
  salesByCategory?: Array<{ category: string; totalRevenue: number; totalQuantity: number }>
  dailySales: Array<{
    date: string
    salesCount: number
    totalAmount: number
  }>
  lowStockProducts: Array<{
    id: string
    name: string
    sku: string
    stockQuantity: number
    minStockLevel: number
    category: { name: string }
  }>
  salesByCashier?: Array<{ cashierId: string; cashierName?: string; salesCount: number; totalAmount: number }>
  peakHours?: Array<{ hour: number; salesCount: number; totalAmount: number }>
  slowMovers?: Array<{ id: string; name: string; sku: string; categoryName: string; soldQty: number; revenue: number }>
  deadStockProducts?: Array<{ id: string; name: string; sku: string; stockQuantity: number; category: { name: string } }>
  inventoryKPIs?: { inventoryTurnover: number; gmroi: number; stockCoverageDays: number | null }
  coverageRisks?: Array<{ id: string; name: string; sku: string; daysLeft: number; stockQuantity: number }>
  discountsAndTaxes?: { totalTaxCollected: number; totalDiscountsAll: number; averageDiscountPerOrder: number; topDiscountedProducts: Array<{ productId: string; name: string; sku: string; discountTotal: number }> }
}

export default function ReportsDashboard() {
  const [period, setPeriod] = useState("30")
  const [mounted, setMounted] = useState(false)
  // Removed compare previous period per request
  // const [compare, setCompare] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportRange, setExportRange] = useState<'7d' | '30d' | '1y' | 'custom'>("30d")
  const [exportStart, setExportStart] = useState("")
  const [exportEnd, setExportEnd] = useState("")
  // Export now supports two report types backed by Excel: inventory_list and inventory_performance
  const [reportType, setReportType] = useState<'inventory_list' | 'inventory_performance'>('inventory_list')
  const [preview, setPreview] = useState<{ headers: string[]; data: any[] } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // No preview: just info-only

  // Handle hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  // Consistent date formatter to avoid hydration errors
  const formatDate = (dateString: string) => {
    if (!mounted) return dateString // Prevent hydration mismatch
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  const { data: metrics, isLoading: loading, refetch } = useQuery({
    queryKey: ['metrics', period],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/metrics?period=${period}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch metrics')
      const result = await response.json()
      return result.data as DashboardMetrics
    },
    refetchOnMount: 'always',
    staleTime: 0,
  })

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load reports data</p>
        <Button onClick={() => refetch()} className="mt-4">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Reports & Analytics</h2>
          <p className="text-muted-foreground">Business insights and performance metrics</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          {null}
          <Button onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setExportOpen(true)}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Overview boxes removed per request */}

      {/* Profitability and AOV */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              <TooltipProvider>
                <UiTooltip>
                  <TooltipTrigger>Average Order Value</TooltipTrigger>
                  <TooltipContent>Average spend per order.</TooltipContent>
                </UiTooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>Average per sale</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.overview.averageOrderValue || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <TooltipProvider>
                <UiTooltip>
                  <TooltipTrigger>Gross Profit</TooltipTrigger>
                  <TooltipContent>Money left after paying for products.</TooltipContent>
                </UiTooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>After product costs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.overview.grossProfit || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <TooltipProvider>
                <UiTooltip>
                  <TooltipTrigger>Profit Margin</TooltipTrigger>
                  <TooltipContent>Percent of sales kept as profit.</TooltipContent>
                </UiTooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>Profit percent</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(metrics.overview.profitMargin || 0).toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Tables */}
      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales">Sales Analytics</TabsTrigger>
          <TabsTrigger value="products">Product Performance</TabsTrigger>
          <TabsTrigger value="inventory">Inventory Status</TabsTrigger>
          <TabsTrigger value="categories">By Category</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Daily Sales Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Daily Sales Trend</CardTitle>
                <CardDescription>Sales performance over time</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics.dailySales.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={metrics.dailySales}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => formatDate(value)}
                      />
                      <YAxis />
                      <RechartsTooltip
                        labelFormatter={(value: string) => formatDate(value)}
                        formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                      />
                      <Line
                        type="monotone"
                        dataKey="totalAmount"
                        stroke="#8884d8"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No sales data available for the selected period</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment Method Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
                <CardDescription>Revenue by payment type</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={metrics.salesByPaymentMethod}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ paymentMethod, _sum }) => `${paymentMethod}: ${formatCurrency(_sum.totalAmount)}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="_sum.totalAmount"
                    >
                      {metrics.salesByPaymentMethod.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Peak Hours and Sales by Cashier */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Peak Hours</CardTitle>
                <CardDescription>Best times by revenue</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics.peakHours && metrics.peakHours.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={metrics.peakHours}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis />
                      <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="totalAmount" fill="#00C49F" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No peak hour data for the selected period</p>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Sales by Cashier</CardTitle>
                <CardDescription>Top performers</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cashier</TableHead>
                      <TableHead>Sales</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(metrics.salesByCashier || []).map((row) => (
                      <TableRow key={row.cashierId}>
                        <TableCell>{row.cashierName || row.cashierId}</TableCell>
                        <TableCell>{row.salesCount}</TableCell>
                        <TableCell>{formatCurrency(row.totalAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Selling Products</CardTitle>
              <CardDescription>Best performing products by quantity sold (includes revenue)</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.topProducts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Quantity Sold</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Sales Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.topProducts.map((item, index) => (
                      <TableRow key={item.product?.id || index}>
                        <TableCell className="font-medium">
                          {item.product?.name || 'Unknown Product'}
                        </TableCell>
                        <TableCell>{item.product?.category?.name || 'Uncategorized'}</TableCell>
                        <TableCell>{item.totalQuantity}</TableCell>
                        <TableCell>{formatCurrency(item.totalRevenue)}</TableCell>
                        <TableCell>{item.salesCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No sales data available for the selected period</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sales by Category</CardTitle>
              <CardDescription>Revenue and quantity by product category</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.salesByCategory && metrics.salesByCategory.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Quantity Sold</TableHead>
                      <TableHead className="text-right">Total Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.salesByCategory.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.category}</TableCell>
                        <TableCell className="text-right">{item.totalQuantity}</TableCell>
                        <TableCell className="text-right">{typeof item.totalRevenue === 'number' ? formatCurrency(item.totalRevenue) : item.totalRevenue}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No category data for the selected period</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Low Stock Alert</CardTitle>
              <CardDescription>Products that need restocking</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Min Level</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.lowStockProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.sku}</TableCell>
                      <TableCell>{product.category.name}</TableCell>
                      <TableCell className="text-red-600 font-semibold">
                        {product.stockQuantity}
                      </TableCell>
                      <TableCell>{product.minStockLevel}</TableCell>
                      <TableCell>
                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">
                          Low Stock
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Inventory Turnover</CardTitle>
                <CardDescription>COGS / Average Inventory</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(metrics.inventoryKPIs?.inventoryTurnover || 0).toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>GMROI</CardTitle>
                <CardDescription>Gross Profit / Average Inventory</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(metrics.inventoryKPIs?.gmroi || 0).toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Stock Coverage Days</CardTitle>
                <CardDescription>Projected days before stockout</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.inventoryKPIs?.stockCoverageDays ? metrics.inventoryKPIs.stockCoverageDays.toFixed(1) : '—'}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Slow Movers</CardTitle>
                <CardDescription>Lowest sales within period</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Qty Sold</TableHead>
                      <TableHead>Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(metrics.slowMovers || []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>{p.sku}</TableCell>
                        <TableCell>{p.soldQty}</TableCell>
                        <TableCell>{formatCurrency(p.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Dead Stock</CardTitle>
                <CardDescription>On-hand items with zero sales</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(metrics.deadStockProducts || []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>{p.sku}</TableCell>
                        <TableCell>{p.stockQuantity}</TableCell>
                        <TableCell>{p.category?.name || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Coverage Risks</CardTitle>
              <CardDescription>Likely to stock out within 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Days Left</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(metrics.coverageRisks || []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>{p.sku}</TableCell>
                      <TableCell>{p.stockQuantity}</TableCell>
                      <TableCell>{p.daysLeft.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Export CSV Dialog with report type and preview */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] md:max-w-3xl lg:max-w-5xl xl:max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Export Reports</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 overflow-auto">
            <div>
              <Label className="mb-2 block">Report Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { k: 'inventory_list', label: 'Inventory List' },
                  { k: 'inventory_performance', label: 'Inventory Performance' },
                ] as const).map(o => (
                  <Button key={o.k} variant={reportType === o.k ? 'default' : 'outline'} size="sm" onClick={() => setReportType(o.k)}>
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Date Range</Label>
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
                    <Label htmlFor="exportStart">Start</Label>
                    <Input id="exportStart" type="date" value={exportStart} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExportStart(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="exportEnd">End</Label>
                    <Input id="exportEnd" type="date" value={exportEnd} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExportEnd(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* Preview controls */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="mb-1 block">Preview</Label>
                <p className="text-xs text-muted-foreground">Loads the first rows in-app before downloading.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const params = new URLSearchParams()
                    params.set('type', reportType)
                    params.set('range', exportRange)
                    params.set('format', 'json')
                    if (exportRange === 'custom') {
                      if (exportStart) params.set('start', exportStart)
                      if (exportEnd) params.set('end', exportEnd)
                    }
                    setPreviewLoading(true)
                    setPreview(null)
                    try {
                      const res = await fetch(`/api/reports/export?${params.toString()}`)
                      if (!res.ok) return
                      const json = await res.json()
                      if (Array.isArray(json?.headers) && json.headers.length > 0) {
                        setPreview({ headers: json.headers, data: json.data || [] })
                      } else if (Array.isArray(json?.data) && json.data.length > 0) {
                        const headers = Object.keys(json.data[0])
                        setPreview({ headers, data: json.data })
                      } else {
                        setPreview({ headers: [], data: [] })
                      }
                    } finally {
                      setPreviewLoading(false)
                    }
                  }}
                >{previewLoading ? 'Loading…' : 'Load Preview'}</Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const params = new URLSearchParams()
                    params.set('type', reportType)
                    params.set('range', exportRange)
                    params.set('format', 'json')
                    if (exportRange === 'custom') {
                      if (exportStart) params.set('start', exportStart)
                      if (exportEnd) params.set('end', exportEnd)
                    }

                    try {
                      const res = await fetch(`/api/reports/export?${params.toString()}`)
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
                      doc.text(`Report: ${reportType.replace('_', ' ').toUpperCase()}`, 14, 15)
                      doc.setFontSize(10)
                      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22)

                      autoTable(doc, {
                        startY: 25,
                        head: [headers],
                        body: data.map(row => headers.map(h => row[h])),
                        styles: { fontSize: 7, cellPadding: 2 },
                        headStyles: { fillColor: [66, 66, 66] }
                      })

                      doc.save(`report_${reportType}_${new Date().toISOString().slice(0, 10)}.pdf`)
                    } catch (e) {
                      console.error(e)
                      alert('Failed to generate PDF')
                    }
                  }}
                >Download PDF</Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    const params = new URLSearchParams()
                    params.set('type', reportType)
                    params.set('range', exportRange)
                    if (exportRange === 'custom') {
                      if (exportStart) params.set('start', exportStart)
                      if (exportEnd) params.set('end', exportEnd)
                    }
                    const res = await fetch(`/api/reports/export?${params.toString()}`)
                    const blob = await res.blob()
                    const url = window.URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    const cd = res.headers.get('content-disposition') || ''
                    const m = cd.match(/filename=\"(.+)\"/)
                    a.download = m?.[1] || 'reports_export.xlsx'
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    window.URL.revokeObjectURL(url)
                  }}
                >Download Excel (.xlsx)</Button>
              </div>
            </div>
            <div className="border rounded-md flex flex-col w-full">
              {previewLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading preview…</div>
              ) : preview && preview.headers.length > 0 ? (
                <div className="flex-1">
                  <Table
                    className="w-max"
                    wrapperClassName="w-full max-h-[70vh] overflow-auto"
                    wrapperStyle={{ WebkitOverflowScrolling: 'touch' }}
                    style={{ minWidth: Math.max(800, (preview.headers.length || 1) * 160) }}
                  >
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        {preview.headers.map(h => (
                          <TableHead key={h} className="whitespace-nowrap px-3 py-2 bg-muted/50">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.data.slice(0, 50).map((row, idx) => (
                        <TableRow key={idx}>
                          {preview.headers.map(h => (
                            <TableCell key={h} className="whitespace-nowrap text-xs px-3 py-2">{String(row[h] ?? '')}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {preview.data.length > 50 && (
                    <div className="p-2 text-xs text-muted-foreground text-center border-t bg-muted/30 sticky bottom-0">Showing first 50 of {preview.data.length} rows</div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-sm text-muted-foreground text-center">Click "Load Preview" to preview the export</div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setExportOpen(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

