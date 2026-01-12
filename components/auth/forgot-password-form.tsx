"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Key, Eye, EyeOff, AlertCircle, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

export function ForgotPasswordForm() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [formData, setFormData] = useState({
        recoveryKey: "",
        newPassword: "",
        confirmPassword: "",
    })

    const formatRecoveryKey = (value: string) => {
        // Remove all non-alphanumeric characters
        const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "")
        // Add dashes every 4 characters
        const parts = clean.match(/.{1,4}/g) || []
        return parts.join("-").substring(0, 19) // XXXX-XXXX-XXXX-XXXX = 19 chars
    }

    const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatRecoveryKey(e.target.value)
        setFormData({ ...formData, recoveryKey: formatted })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        // Validate
        if (formData.recoveryKey.replace(/-/g, "").length !== 16) {
            setError("Recovery key must be 16 characters (XXXX-XXXX-XXXX-XXXX)")
            return
        }

        if (formData.newPassword.length < 6) {
            setError("Password must be at least 6 characters")
            return
        }

        if (formData.newPassword !== formData.confirmPassword) {
            setError("Passwords do not match")
            return
        }

        setLoading(true)

        try {
            const response = await fetch("/api/auth/recovery-key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recoveryKey: formData.recoveryKey,
                    newPassword: formData.newPassword,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || "Failed to reset password")
                return
            }

            toast.success("Password reset successfully! Please login with your new password.")
            router.push("/auth/login")
        } catch (err) {
            console.error("Reset password error:", err)
            setError("Connection error. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="w-full max-w-md backdrop-blur-sm bg-card/95 border-0 shadow-2xl shadow-primary/5">
            <CardHeader className="text-center space-y-6 pb-8">
                <div className="flex justify-center">
                    <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-2xl shadow-lg">
                        <Key className="h-8 w-8 text-white" />
                    </div>
                </div>
                <div className="space-y-2">
                    <CardTitle className="text-3xl font-bold font-serif tracking-tight">
                        Reset Password
                    </CardTitle>
                    <CardDescription className="text-base text-muted-foreground">
                        Enter your master recovery key to reset your password
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
                        <Label htmlFor="recoveryKey" className="text-sm font-medium">
                            Recovery Key
                        </Label>
                        <Input
                            id="recoveryKey"
                            type="text"
                            placeholder="XXXX-XXXX-XXXX-XXXX"
                            value={formData.recoveryKey}
                            onChange={handleKeyChange}
                            className="h-11 font-mono text-center text-lg tracking-wider uppercase"
                            disabled={loading}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="newPassword" className="text-sm font-medium">
                            New Password
                        </Label>
                        <div className="relative">
                            <Input
                                id="newPassword"
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter new password"
                                value={formData.newPassword}
                                onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                                className="h-11 pr-10"
                                disabled={loading}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword" className="text-sm font-medium">
                            Confirm Password
                        </Label>
                        <div className="relative">
                            <Input
                                id="confirmPassword"
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Confirm new password"
                                value={formData.confirmPassword}
                                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                className="h-11 pr-10"
                                disabled={loading}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-medium shadow-lg shadow-primary/25"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Resetting Password...
                            </>
                        ) : (
                            "Reset Password"
                        )}
                    </Button>

                    <div className="text-center">
                        <Link
                            href="/auth/login"
                            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to login
                        </Link>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}
