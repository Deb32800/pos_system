"use client"

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { TrendingUp, DollarSign, ShoppingCart, Package, Download, AlertTriangle, Award } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import AdminLayout from "@/components/admin/admin-layout"
import { formatCurrency } from "@/lib/utils"

interface Sale {
  id: string
  sale_number: string
  total_amount: number
  created_at: string
  users: { id: string; full_name: string } | null
  sale_items: Array<{
    id: string
    quantity: number
    unit_price: number
    total_price: number
    products: {
      id: string
      name: string
      sku: string
      categories: { id: string; name: string } | null
    } | null
  }>
}

interface Product {
  id: string
  name: string
  sku: string
  price: number
  stock_quantity: number
  min_stock_level: number
  categories: { id: string; name: string } | null
}

interface Staff {
  id: string
  full_name: string
}

interface Category {
  id: string
  name: string
}

interface ReportsSystemProps {
  sales: Sale[]
  products: Product[]
  staff: Staff[]
  categories: Category[]
}

const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#00ff00", "#ff00ff"]

export default function ReportsSystem({ sales, products, staff, categories }: ReportsSystemProps) {
  const [dateRange, setDateRange] = useState("30")
  const [exportOpen, setExportOpen] = useState(false)
  const [reportType, setReportType] = useState<'summary'|'inventory'|'profitability'>('summary')
  const [range, setRange] = useState<'7d'|'30d'|'1y'|'custom'>('30d')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [preview, setPreview] = useState<{ headers?: string[]; data?: any[]; type?: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Calculate key metrics
  const totalRevenue = sales.reduce((sum, sale) => sum + Number.parseFloat(sale.total_amount.toString()), 0)
  const totalSales = sales.length
  const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0
  const lowStockProducts = products.filter((p) => p.stock_quantity <= p.min_stock_level)

  // Daily sales data for line chart
  const dailySalesData = useMemo(() => {
    const salesByDate = sales.reduce(
      (acc, sale) => {
        const date = new Date(sale.created_at).toLocaleDateString()
        if (!acc[date]) {
          acc[date] = { date, revenue: 0, sales: 0 }
        }
        acc[date].revenue += Number.parseFloat(sale.total_amount.toString())
        acc[date].sales += 1
        return acc
      },
      {} as Record<string, { date: string; revenue: number; sales: number }>
    )

    return Object.values(salesByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [sales])

  // Staff performance data
  const staffPerformance = useMemo(() => {
    const performanceByStaff = sales.reduce(
      (acc, sale) => {
        const staffName = sale.users?.full_name || "Unknown"
        if (!acc[staffName]) {
          acc[staffName] = { name: staffName, sales: 0, revenue: 0 }
        }
        acc[staffName].sales += 1
        acc[staffName].revenue += Number.parseFloat(sale.total_amount.toString())
        return acc
      },
      {} as Record<string, { name: string; sales: number; revenue: number }>,
    )

    return Object.values(performanceByStaff).sort((a, b) => b.revenue - a.revenue)
  }, [sales])

  // Category performance data
  const categoryPerformance = useMemo(() => {
    const performanceByCategory = sales.reduce(
      (acc, sale) => {
        sale.sale_items.forEach((item) => {
          const categoryName = item.products?.categories?.name || "Uncategorized"
          if (!acc[categoryName]) {
            acc[categoryName] = { name: categoryName, revenue: 0, quantity: 0 }
          }
          acc[categoryName].revenue += Number.parseFloat(item.total_price.toString())
          acc[categoryName].quantity += item.quantity
        })
        return acc
      },
      {} as Record<string, { name: string; revenue: number; quantity: number }>,
    )

    return Object.values(performanceByCategory).sort((a, b) => b.revenue - a.revenue)
  }, [sales])

  // Top selling products
  const topProducts = useMemo(() => {
    const productSales = sales.reduce(
      (acc, sale) => {
        sale.sale_items.forEach((item) => {
          const productName = item.products?.name || "Unknown Product"
          if (!acc[productName]) {
            acc[productName] = { name: productName, quantity: 0, revenue: 0 }
          }
          acc[productName].quantity += item.quantity
          acc[productName].revenue += Number.parseFloat(item.total_price.toString())
        })
        return acc
      },
      {} as Record<string, { name: string; quantity: number; revenue: number }>,
    )

    return Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)
  }, [sales])

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Reports & Analytics</h2>
            <p className="text-muted-foreground">Business insights and performance metrics</p>
          </div>
          <div className="flex gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">Last {dateRange} days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSales}</div>
              <p className="text-xs text-muted-foreground">Transactions</p>
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lowStockProducts.length}</div>
              <p className="text-xs text-muted-foreground">Need attention</p>
            </CardContent>
          </Card>
        </div>

        {/* Reports Tabs */}
        <Tabs defaultValue="sales" className="space-y-4">
          <TabsList>
            <TabsTrigger value="sales">Sales Analytics</TabsTrigger>
            <TabsTrigger value="products">Product Performance</TabsTrigger>
            <TabsTrigger value="staff">Staff Performance</TabsTrigger>
            <TabsTrigger value="inventory">Inventory Report</TabsTrigger>
          </TabsList>

          {/* Sales Analytics */}
          <TabsContent value="sales" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Daily Revenue Trend</CardTitle>
                  <CardDescription>Revenue over the last {dateRange} days</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dailySalesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(value) => [formatCurrency(Number(value)), "Revenue"]} />
                      <Line type="monotone" dataKey="revenue" stroke="#8884d8" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sales by Category</CardTitle>
                  <CardDescription>Revenue distribution by product category</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={categoryPerformance}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="revenue"
                      >
                        {categoryPerformance.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [formatCurrency(Number(value)), "Revenue"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Product Performance */}
          <TabsContent value="products" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Selling Products</CardTitle>
                <CardDescription>Best performing products by quantity sold</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Quantity Sold</TableHead>
                      <TableHead>Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.map((product, index) => (
                      <TableRow key={product.name}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {index < 3 && <Award className="h-4 w-4 text-yellow-500" />}#{index + 1}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.quantity}</TableCell>
                        <TableCell>{formatCurrency(product.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Staff Performance */}
          <TabsContent value="staff" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Staff Sales Performance</CardTitle>
                  <CardDescription>Revenue generated by each staff member</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={staffPerformance}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => [formatCurrency(Number(value)), "Revenue"]} />
                      <Bar dataKey="revenue" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Staff Performance Summary</CardTitle>
                  <CardDescription>Detailed performance metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff Member</TableHead>
                        <TableHead>Sales Count</TableHead>
                        <TableHead>Total Revenue</TableHead>
                        <TableHead>Avg Sale</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffPerformance.map((staff) => (
                        <TableRow key={staff.name}>
                          <TableCell className="font-medium">{staff.name}</TableCell>
                          <TableCell>{staff.sales}</TableCell>
                          <TableCell>{formatCurrency(staff.revenue)}</TableCell>
                          <TableCell>{formatCurrency(staff.revenue / staff.sales)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Inventory Report */}
          <TabsContent value="inventory" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Low Stock Alert</CardTitle>
                <CardDescription>Products that need restocking</CardDescription>
              </CardHeader>
              <CardContent>
                {lowStockProducts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Current Stock</TableHead>
                        <TableHead>Min Level</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowStockProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{product.categories?.name || "Uncategorized"}</Badge>
                          </TableCell>
                          <TableCell>{product.stock_quantity}</TableCell>
                          <TableCell>{product.min_stock_level}</TableCell>
                          <TableCell>
                            <Badge variant={product.stock_quantity === 0 ? "destructive" : "secondary"}>
                              {product.stock_quantity === 0 ? "Out of Stock" : "Low Stock"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>All products are well stocked!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Export Reports CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="flex flex-wrap gap-3">
              <Select value={reportType} onValueChange={(v) => setReportType(v as any)}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Report Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">Summary</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="profitability">Profitability</SelectItem>
                </SelectContent>
              </Select>
              <Select value={range} onValueChange={(v) => setRange(v as any)}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Range" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="1y">Last 1 year</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {range === 'custom' && (
                <div className="flex gap-2">
                  <div>
                    <Label htmlFor="rstart">Start</Label>
                    <Input id="rstart" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="rend">End</Label>
                    <Input id="rend" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                  </div>
                </div>
              )}
              <div className="flex-1" />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    const params = new URLSearchParams()
                    params.set('type', reportType)
                    params.set('range', range)
                    params.set('format', 'json')
                    if (range === 'custom') { if (start) params.set('start', start); if (end) params.set('end', end) }
                    setPreviewLoading(true)
                    setPreview(null)
                    try {
                      const res = await fetch(`/api/reports/export?${params.toString()}`)
                      if (!res.ok) {
                        console.error('Export API error:', res.status)
                        return
                      }
                      const json = await res.json()
                      // Use headers from response if provided, otherwise derive from first row
                      if (json?.headers && Array.isArray(json.headers) && json.headers.length > 0) {
                        setPreview({ headers: json.headers, data: json.data || [], type: json.type })
                      } else if (Array.isArray(json?.data) && json.data.length > 0 && typeof json.data[0] === 'object') {
                        const headers = Object.keys(json.data[0])
                        setPreview({ headers, data: json.data, type: json.type })
                      } else {
                        setPreview({ headers: [], data: [], type: json.type })
                      }
                    } catch (err) {
                      console.error('Preview load error:', err)
                      setPreview(null)
                    } finally {
                      setPreviewLoading(false)
                    }
                  }}
                >{previewLoading ? 'Loading…' : 'Load Preview'}</Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const params = new URLSearchParams()
                    params.set('type', reportType)
                    params.set('range', range)
                    params.set('format', 'json')
                    if (range === 'custom') { if (start) params.set('start', start); if (end) params.set('end', end) }
                    
                    try {
                      const res = await fetch(`/api/reports/export?${params.toString()}`)
                      if (!res.ok) throw new Error('Failed to fetch data')
                      const json = await res.json()
                      
                      let headers: string[] = []
                      let data: any[] = []
                      
                      if (json?.headers && Array.isArray(json.headers) && json.headers.length > 0) {
                        headers = json.headers
                        data = json.data || []
                      } else if (Array.isArray(json?.data) && json.data.length > 0 && typeof json.data[0] === 'object') {
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
                      
                      doc.save(`report_${reportType}_${new Date().toISOString().slice(0,10)}.pdf`)
                    } catch (e) {
                      console.error(e)
                      alert('Failed to generate PDF')
                    }
                  }}
                >Download PDF</Button>
                <Button
                  onClick={async () => {
                    const params = new URLSearchParams()
                    params.set('type', reportType)
                    params.set('range', range)
                    if (range === 'custom') { if (start) params.set('start', start); if (end) params.set('end', end) }
                    const res = await fetch(`/api/reports/export?${params.toString()}`)
                    const blob = await res.blob()
                    const url = window.URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'report_export.csv'
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    window.URL.revokeObjectURL(url)
                  }}
                >Download CSV</Button>
              </div>
            </div>
            <div className="border rounded-md max-h-[60vh] overflow-auto">
              {previewLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading preview…</div>
              ) : preview?.data && preview?.headers && preview.headers.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        {preview.headers.map(h => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.data.slice(0, 50).map((row, idx) => (
                        <TableRow key={idx}>
                          {preview.headers?.map(h => (
                            <TableCell key={h} className="whitespace-nowrap text-xs">
                              {String(row[h] ?? '')}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {preview.data.length > 50 && (
                    <div className="p-2 text-xs text-muted-foreground text-center border-t">
                      Showing first 50 of {preview.data.length} rows
                    </div>
                  )}
                </div>
              ) : preview === null ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  Click "Load Preview" to preview the CSV export
                </div>
              ) : (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No data available for preview
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
