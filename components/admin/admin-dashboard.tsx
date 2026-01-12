"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Package,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Settings,
  LogOut,
  Store,
  Plus,
  Eye,
  DollarSign,
  RotateCcw,
  RefreshCw,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSettings } from "@/components/settings-provider"
import { useQuery } from "@tanstack/react-query"

interface ActivityItem {
  id: string
  type: 'sale' | 'return'
  reference: string | null
  amount: number
  description: string
  reason?: string | null
  createdAt: string | Date
  cashierId?: string
  cashierName?: string
}

interface DashboardData {
  totalProducts?: number
  totalCategories?: number
  totalSales?: number
  monthlySalesTotal?: number
  lowStockCount?: number
  lowStockProducts?: any[]
  recentSales?: any[]
  recentReturns?: any[]
  activityLog?: ActivityItem[]
}

export default function AdminDashboard() {
  const { formatCurrency } = useSettings()
  const router = useRouter()

  // Fetch dashboard data client-side with refetch on every mount
  const { data, isLoading, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await fetch('/api/dashboard/stats', { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch dashboard stats')
      const result = await response.json()
      return result.data || {}
    },
    refetchOnMount: 'always', // Always refetch when component mounts
    staleTime: 0, // Data is always stale
  })

  const {
    totalProducts = 0,
    totalCategories = 0,
    totalSales = 0,
    monthlySalesTotal = 0,
    lowStockCount = 0,
    lowStockProducts = [],
    recentSales = [],
    activityLog = [],
  } = data || {}

  // Mock user for display
  const user = {
    full_name: "Admin User",
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        {/* Header skeleton */}
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-gray-200 animate-pulse rounded" />
            <div className="h-4 w-64 bg-gray-200 animate-pulse rounded" />
          </div>
          <div className="h-10 w-10 bg-gray-200 animate-pulse rounded-full" />
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border bg-white p-6 space-y-3">
              <div className="h-4 w-1/2 bg-gray-200 animate-pulse rounded" />
              <div className="h-8 w-2/3 bg-gray-200 animate-pulse rounded" />
              <div className="h-3 w-3/4 bg-gray-200 animate-pulse rounded" />
            </div>
          ))}
        </div>

        {/* Activity skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-lg border bg-white p-6 space-y-4">
              <div className="h-6 w-1/3 bg-gray-200 animate-pulse rounded" />
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-12 w-full bg-gray-200 animate-pulse rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-4xl font-bold tracking-tight">Welcome back, {user?.full_name || "User"}</h2>
            <p className="text-lg text-muted-foreground">Here's what's happening with your store today.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" asChild>
              <Link href="/admin/inventory?restock=true">
                <RefreshCw className="mr-2 h-4 w-4" />
                Restock
              </Link>
            </Button>
            <Button className="bg-primary hover:bg-primary/90 text-white" asChild>
              <Link href="/admin/inventory/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Total Products</CardTitle>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalProducts}</div>
              <p className="text-sm text-muted-foreground">{totalCategories} categories</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Sales</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSales}</div>
              <p className="text-xs text-muted-foreground">{formatCurrency(monthlySalesTotal || 0)} revenue</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Profit</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(monthlySalesTotal || 0)}</div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
              <AlertTriangle
                className={`h-4 w-4 ${lowStockCount > 0 ? "text-red-500" : "text-muted-foreground"}`}
              />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${lowStockCount > 0 ? "text-red-600" : ""}`}>
                {lowStockCount}
              </div>
              <p className="text-xs text-muted-foreground">
                {lowStockCount > 0 ? "Needs attention" : "All good"}
              </p>
            </CardContent>
          </Card>
        </div>

        {lowStockCount > 0 && lowStockProducts && lowStockProducts.length > 0 && (
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <CardTitle className="text-red-800">Low Stock Alert</CardTitle>
              </div>
              <CardDescription className="text-red-700">The following products need restocking</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {lowStockProducts.slice(0, 5).map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                    <div>
                      <p className="font-medium">{product?.name || "Unknown Product"}</p>
                      <p className="text-sm text-muted-foreground">SKU: {product?.sku || "N/A"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-red-600">{product?.stockQuantity || 0} left</p>
                      <p className="text-xs text-muted-foreground">Min: {product?.minStockLevel || 0}</p>
                    </div>
                  </div>
                ))}
                {lowStockProducts.length > 5 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    And {lowStockProducts.length - 5} more products...
                  </p>
                )}
                <Button variant="outline" className="w-full mt-4 bg-white border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" asChild>
                  <Link href="/admin/inventory?lowStock=true">
                    View All Low Stock
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest sales and returns from your store</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/sales">
                  <Eye className="mr-2 h-4 w-4" />
                  View All
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activityLog && activityLog.length > 0 ? (
                activityLog.map((activity) => (
                  <div
                    key={activity?.id || Math.random()}
                    className={`flex items-center justify-between p-4 border rounded-lg ${activity.type === 'return' ? 'border-orange-200 bg-orange-50/50' : ''
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activity.type === 'return'
                        ? 'bg-orange-100'
                        : 'bg-primary/10'
                        }`}>
                        {activity.type === 'return' ? (
                          <RotateCcw className="h-4 w-4 text-orange-600" />
                        ) : (
                          <ShoppingCart className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {activity.type === 'return' ? 'Return' : 'Sale'}: {activity?.reference || "Unknown"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {activity.description}
                          {activity.type === 'sale' && activity.cashierName && (
                            <span className="ml-1">• by {activity.cashierName}</span>
                          )}
                          {activity.type === 'return' && activity.reason && (
                            <span className="ml-1">• {activity.reason}</span>
                          )}
                          {' • '}
                          {activity?.createdAt ? new Date(activity.createdAt).toLocaleDateString() : "Unknown date"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${activity.type === 'return' ? 'text-orange-600' : ''}`}>
                        {activity.type === 'return' ? '-' : ''}{formatCurrency(Number(activity?.amount || 0))}
                      </p>
                      <Badge
                        variant={activity.type === 'return' ? 'outline' : 'secondary'}
                        className={`text-xs ${activity.type === 'return' ? 'border-orange-300 text-orange-700' : ''}`}
                      >
                        {activity.type === 'return' ? 'Returned' : 'Completed'}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No recent activity found</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks to manage your store</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Button variant="outline" className="h-20 flex-col gap-2 bg-transparent" asChild>
                <Link href="/admin/inventory/new">
                  <Plus className="h-5 w-5" />
                  Add Product
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2 bg-transparent" asChild>
                <Link href="/admin/inventory">
                  <Package className="h-5 w-5" />
                  Manage Inventory
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2 bg-transparent" asChild>
                <Link href="/admin/sales">
                  <ShoppingCart className="h-5 w-5" />
                  View Sales
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2 bg-transparent" asChild>
                <Link href="/admin/reports">
                  <BarChart3 className="h-5 w-5" />
                  Generate Reports
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
