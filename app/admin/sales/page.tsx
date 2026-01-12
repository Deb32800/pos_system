import SalesDashboard from "@/components/admin/sales-dashboard"

// Force dynamic rendering - no static caching
export const dynamic = 'force-dynamic'

export default function SalesPage() {
  return <SalesDashboard />
}
