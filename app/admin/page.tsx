import AdminDashboard from "@/components/admin/admin-dashboard"

// Force dynamic rendering - no static caching
export const dynamic = 'force-dynamic'

export default function AdminPage() {
  // Dashboard now fetches its own data client-side for auto-refresh
  return <AdminDashboard />
}