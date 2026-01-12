"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Loader2, Store, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { PasswordChangeModal } from "./password-change-modal"
import { FirstRunSetup } from "./first-run-setup"

export default function LoginForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  })

  // State for modals
  const [showFirstRun, setShowFirstRun] = useState(false)
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Retry function for handling server startup delays in Electron
    const attemptLogin = async (retries = 3, delay = 1000): Promise<Response> => {
      try {
        return await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
      } catch (err) {
        if (retries > 0) {
          await new Promise(r => setTimeout(r, delay))
          return attemptLogin(retries - 1, delay * 2)
        }
        throw err
      }
    }

    try {
      const response = await attemptLogin()

      const data = await response.json()

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 503) {
          setError(data.error || 'Service temporarily unavailable')
          toast.error('Database initializing. Please try again.')
        } else {
          setError(data.error || 'Failed to sign in')
          toast.error(data.error || 'Failed to sign in')
        }
        return
      }

      // Store redirect for after modals complete
      setPendingRedirect(data.redirectTo || '/')

      // Check if first-run setup is needed
      if (data.isFirstRun) {
        toast.success(`Welcome, ${data.user.fullName}!`)
        setShowFirstRun(true)
        return
      }

      // Check if password change is required
      if (data.mustChangePassword) {
        toast.success(`Welcome back, ${data.user.fullName}!`)
        setShowPasswordChange(true)
        return
      }

      toast.success(`Welcome back, ${data.user.fullName}!`)

      // Redirect based on role
      router.push(data.redirectTo || '/')
      router.refresh()
    } catch (err) {
      console.error('Login error:', err)
      setError('Connection error. Server may still be starting. Please wait and try again.')
      toast.error('Connection error. Please try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  const handleFirstRunComplete = () => {
    setShowFirstRun(false)
    // Show password change modal after first run
    setShowPasswordChange(true)
  }

  const handlePasswordChangeComplete = () => {
    setShowPasswordChange(false)
    // Now redirect
    if (pendingRedirect) {
      router.push(pendingRedirect)
      router.refresh()
    }
  }

  return (
    <>
      <Card className="w-full max-w-md backdrop-blur-sm bg-card/95 border-0 shadow-2xl shadow-primary/5">
        <CardHeader className="text-center space-y-6 pb-8">
          <div className="flex justify-center">
            <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-2xl shadow-lg">
              <Store className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold font-serif tracking-tight">Welcome back</CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              Sign in to your POS account
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-foreground">
                Username
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="Enter your username"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="h-11 bg-background/50 border-border/50 focus:border-primary transition-colors"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="h-12 bg-input/50 border-border/50 focus:border-ring/50 focus:bg-background transition-all duration-200"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-medium shadow-lg shadow-primary/25 transition-all duration-200"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="text-center text-sm pt-2">
            <a
              href="/auth/forgot-password"
              className="text-primary hover:text-primary/80 font-medium transition-colors duration-200 underline underline-offset-2 cursor-pointer"
            >
              Forgot password?
            </a>
          </div>
        </CardContent>
      </Card>

      {/* First Run Setup Modal */}
      <FirstRunSetup
        open={showFirstRun}
        onComplete={handleFirstRunComplete}
      />

      {/* Password Change Modal */}
      <PasswordChangeModal
        open={showPasswordChange}
        onSuccess={handlePasswordChangeComplete}
        isForced={true}
      />
    </>
  )
}
