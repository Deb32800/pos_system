"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Loader2, Store, Shield, AlertCircle } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

export default function SignUpForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [isFirstUser, setIsFirstUser] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: ''
  })

  // Check if this will be the first user (admin)
  useEffect(() => {
    const checkFirstUser = async () => {
      try {
        const res = await fetch('/api/users')
        if (res.ok) {
          const data = await res.json()
          setIsFirstUser(!data.users || data.users.length === 0)
        } else {
          // API error, might be first time setup
          setIsFirstUser(true)
        }
      } catch {
        // Network error or first time setup
        setIsFirstUser(true)
      }
    }
    checkFirstUser()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to create account')
        toast.error(data.error || 'Failed to create account')
        return
      }

      if (data.isFirstUser) {
        toast.success(`Welcome, ${data.user.fullName}! You are now the administrator.`)
      } else {
        toast.success(`Welcome, ${data.user.fullName}!`)
      }

      // Redirect based on role
      router.push(data.redirectTo || (data.user.role === 'ADMIN' ? '/admin' : '/staff'))
      router.refresh()
    } catch (err) {
      console.error('Signup error:', err)
      setError('Connection error. Please check your network and try again.')
      toast.error('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="flex items-center justify-center w-12 h-12 bg-primary rounded-xl">
            <Store className="h-6 w-6 text-primary-foreground" />
          </div>
        </div>
        <div>
          <CardTitle className="text-2xl font-bold">
            {isFirstUser ? 'Setup Administrator' : 'Create account'}
          </CardTitle>
          <CardDescription>
            {isFirstUser
              ? 'Set up your admin account to get started'
              : 'Set up your Cat Shop POS account'
            }
          </CardDescription>
        </div>

        {isFirstUser && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg text-sm text-primary">
            <Shield className="h-4 w-4 flex-shrink-0" />
            <span>You will be the administrator with full access</span>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="John Doe"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              type="text"
              placeholder="johndoe"
              required
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="h-11"
            />
          </div>



          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="h-11"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isFirstUser ? 'Setting up...' : 'Creating account...'}
              </>
            ) : (
              isFirstUser ? "Setup Administrator" : "Create Account"
            )}
          </Button>

          {!isFirstUser && (
            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
