import StaffDashboard from "@/components/staff/staff-dashboard"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"

// Force dynamic rendering - no static caching
export const dynamic = 'force-dynamic'

export default async function StaffPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <StaffDashboard
      user={{
        id: user.id,
        full_name: user.fullName,
        role: user.role,
      }}
    />
  )
}