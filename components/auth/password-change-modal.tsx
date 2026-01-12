"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

interface PasswordChangeModalProps {
    open: boolean
    onSuccess: () => void
    isForced?: boolean
}

export function PasswordChangeModal({ open, onSuccess, isForced = false }: PasswordChangeModalProps) {
    const [loading, setLoading] = useState(false)
    const [showCurrentPassword, setShowCurrentPassword] = useState(false)
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [formData, setFormData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    })
    const [error, setError] = useState<string | null>(null)

    const validatePassword = (password: string) => {
        if (password.length < 6) return "Password must be at least 6 characters"
        return null
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        // Validate passwords
        const passwordError = validatePassword(formData.newPassword)
        if (passwordError) {
            setError(passwordError)
            return
        }

        if (formData.newPassword !== formData.confirmPassword) {
            setError("Passwords do not match")
            return
        }

        if (formData.currentPassword === formData.newPassword) {
            setError("New password must be different from current password")
            return
        }

        setLoading(true)

        try {
            const response = await fetch("/api/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    currentPassword: formData.currentPassword,
                    newPassword: formData.newPassword,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || "Failed to change password")
                return
            }

            toast.success("Password changed successfully!")
            onSuccess()
        } catch (err) {
            console.error("Password change error:", err)
            setError("Connection error. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={() => { }}>
            <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
                <DialogHeader className="text-center">
                    <div className="flex justify-center mb-4">
                        <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-primary to-secondary rounded-2xl shadow-lg">
                            <Lock className="h-7 w-7 text-white" />
                        </div>
                    </div>
                    <DialogTitle className="text-xl font-bold">
                        {isForced ? "Change Your Password" : "Update Password"}
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        {isForced
                            ? "For security, please change your default password before continuing."
                            : "Enter your current password and choose a new one."}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <div className="relative">
                            <Input
                                id="currentPassword"
                                type={showCurrentPassword ? "text" : "password"}
                                value={formData.currentPassword}
                                onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                                placeholder="Enter current password"
                                required
                                disabled={loading}
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="newPassword">New Password</Label>
                        <div className="relative">
                            <Input
                                id="newPassword"
                                type={showNewPassword ? "text" : "password"}
                                value={formData.newPassword}
                                onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                                placeholder="Enter new password (min 6 characters)"
                                required
                                disabled={loading}
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <div className="relative">
                            <Input
                                id="confirmPassword"
                                type={showConfirmPassword ? "text" : "password"}
                                value={formData.confirmPassword}
                                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                placeholder="Confirm new password"
                                required
                                disabled={loading}
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {formData.confirmPassword && formData.newPassword === formData.confirmPassword && (
                            <div className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Passwords match</span>
                            </div>
                        )}
                    </div>

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-11 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Changing Password...
                            </>
                        ) : (
                            "Change Password"
                        )}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
