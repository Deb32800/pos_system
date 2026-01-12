"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Key, Copy, CheckCircle2, AlertTriangle, Shield } from "lucide-react"
import { toast } from "sonner"

interface FirstRunSetupProps {
    open: boolean
    onComplete: () => void
}

export function FirstRunSetup({ open, onComplete }: FirstRunSetupProps) {
    const [loading, setLoading] = useState(true)
    const [confirming, setConfirming] = useState(false)
    const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
    const [keySaved, setKeySaved] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (open) {
            generateKey()
        }
    }, [open])

    const generateKey = async () => {
        setLoading(true)
        try {
            const response = await fetch("/api/auth/recovery-key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "generate" }),
            })

            const data = await response.json()

            if (!response.ok) {
                toast.error(data.error || "Failed to generate recovery key")
                return
            }

            setRecoveryKey(data.recoveryKey)
        } catch (err) {
            console.error("Generate key error:", err)
            toast.error("Connection error. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    const copyToClipboard = async () => {
        if (!recoveryKey) return

        try {
            await navigator.clipboard.writeText(recoveryKey)
            setCopied(true)
            toast.success("Recovery key copied to clipboard!")
            setTimeout(() => setCopied(false), 3000)
        } catch (err) {
            toast.error("Failed to copy. Please copy manually.")
        }
    }

    const handleConfirm = async () => {
        if (!keySaved) {
            toast.error("Please confirm that you have saved the recovery key")
            return
        }

        setConfirming(true)
        try {
            const response = await fetch("/api/auth/recovery-key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "confirm" }),
            })

            const data = await response.json()

            if (!response.ok) {
                toast.error(data.error || "Failed to complete setup")
                return
            }

            toast.success("Setup complete!")
            onComplete()
        } catch (err) {
            console.error("Confirm error:", err)
            toast.error("Connection error. Please try again.")
        } finally {
            setConfirming(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={() => { }}>
            <DialogContent className="sm:max-w-lg bg-card" onPointerDownOutside={(e) => e.preventDefault()}>
                <DialogHeader className="text-center">
                    <div className="flex justify-center mb-4">
                        <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-primary to-secondary rounded-2xl shadow-lg">
                            <Shield className="h-7 w-7 text-white" />
                        </div>
                    </div>
                    <DialogTitle className="text-xl font-bold">Master Recovery Key</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Save this key securely. You'll need it to reset your password if you ever forget it.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 mt-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                            <p className="text-sm text-muted-foreground">Generating recovery key...</p>
                        </div>
                    ) : recoveryKey ? (
                        <>
                            <div className="relative">
                                <div className="p-4 bg-muted/50 rounded-xl border border-border text-center">
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                        <Key className="h-4 w-4 text-primary" />
                                        <span className="text-xs font-medium text-primary uppercase tracking-wide">
                                            Recovery Key
                                        </span>
                                    </div>
                                    <p className="font-mono text-2xl font-bold text-foreground tracking-wider">
                                        {recoveryKey}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={copyToClipboard}
                                    className="absolute top-2 right-2"
                                >
                                    {copied ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>

                            <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                                <div className="text-sm">
                                    <p className="font-medium text-destructive">Important</p>
                                    <p className="text-muted-foreground mt-1">
                                        Write this key down or store it in a secure password manager.
                                        This key cannot be recovered if lost.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="keySaved"
                                    checked={keySaved}
                                    onCheckedChange={(checked) => setKeySaved(checked === true)}
                                />
                                <Label
                                    htmlFor="keySaved"
                                    className="text-sm font-medium leading-none cursor-pointer"
                                >
                                    I have saved this recovery key in a secure location
                                </Label>
                            </div>

                            <Button
                                onClick={handleConfirm}
                                disabled={!keySaved || confirming}
                                className="w-full h-11 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
                            >
                                {confirming ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Confirming...
                                    </>
                                ) : (
                                    "Continue"
                                )}
                            </Button>
                        </>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-destructive">Failed to generate recovery key</p>
                            <Button
                                onClick={generateKey}
                                variant="outline"
                                className="mt-4"
                            >
                                Try Again
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
