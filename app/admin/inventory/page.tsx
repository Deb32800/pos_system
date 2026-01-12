import { Suspense } from 'react'
import InventoryDashboard from "@/components/admin/inventory-dashboard"

// Force dynamic rendering - no static caching
export const dynamic = 'force-dynamic'

export default function InventoryPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InventoryDashboard />
    </Suspense>
  )
}
