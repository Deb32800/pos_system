"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { AlertTriangle, Trash2 } from "lucide-react"
import { toast } from "sonner"

type Step = 'closed' | 'password' | 'confirm-text' | 'final-confirm'

export function FactoryResetButton() {
    const [step, setStep] = useState<Step>('closed')
    const [password, setPassword] = useState('')
    const [confirmText, setConfirmText] = useState('')
    const [loading, setLoading] = useState(false)
    const [dataPath, setDataPath] = useState('')

    const openDialog = async () => {
        setStep('password')
        setPassword('')
        setConfirmText('')

        // Get user data path for display
        if (window.electronAPI?.app?.getUserDataPath) {
            try {
                const path = await window.electronAPI.app.getUserDataPath()
                setDataPath(path)
            } catch (e) {
                console.error('Failed to get data path:', e)
            }
        }
    }

    const closeDialog = () => {
        setStep('closed')
        setPassword('')
        setConfirmText('')
    }

    const verifyPassword = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/auth/verify-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            })

            if (res.ok) {
                setStep('confirm-text')
            } else {
                toast.error('Invalid password')
            }
        } catch (e) {
            toast.error('Failed to verify password')
        } finally {
            setLoading(false)
        }
    }

    const checkConfirmText = () => {
        if (confirmText.toLowerCase() === 'delete') {
            setStep('final-confirm')
        } else {
            toast.error('Please type "delete" exactly')
        }
    }

    const executeFactoryReset = async () => {
        if (!window.electronAPI?.app?.factoryReset) {
            toast.error('Factory reset is only available in the Electron app')
            return
        }

        setLoading(true)
        try {
            toast.info('Performing factory reset...')
            const result = await window.electronAPI.app.factoryReset()

            if (!result.success) {
                toast.error(result.error || 'Factory reset failed')
            }
            // If successful, app will restart automatically
        } catch (e: any) {
            toast.error(e.message || 'Factory reset failed')
            setLoading(false)
        }
    }

    return (
        <>
            <Button
                variant="destructive"
                onClick={openDialog}
                className="gap-2"
            >
                <Trash2 className="h-4 w-4" />
                Factory Reset
            </Button>

            <Dialog open={step !== 'closed'} onOpenChange={(open) => !open && closeDialog()}>
                <DialogContent className="sm:max-w-md">
                    {/* Step 1: Password Verification */}
                    {step === 'password' && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-red-600">
                                    <AlertTriangle className="h-5 w-5" />
                                    Factory Reset - Admin Verification
                                </DialogTitle>
                                <DialogDescription>
                                    Enter your admin password to continue with factory reset.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="admin-password">Admin Password</Label>
                                    <Input
                                        id="admin-password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Enter your password"
                                        onKeyDown={(e) => e.key === 'Enter' && verifyPassword()}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                                <Button
                                    variant="destructive"
                                    onClick={verifyPassword}
                                    disabled={!password || loading}
                                >
                                    {loading ? 'Verifying...' : 'Continue'}
                                </Button>
                            </DialogFooter>
                        </>
                    )}

                    {/* Step 2: Type DELETE confirmation */}
                    {step === 'confirm-text' && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-red-600">
                                    <AlertTriangle className="h-5 w-5" />
                                    Confirm Factory Reset
                                </DialogTitle>
                                <DialogDescription>
                                    Type <strong className="text-red-600">delete</strong> to confirm you want to proceed.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="confirm-delete">Type "delete" to confirm</Label>
                                    <Input
                                        id="confirm-delete"
                                        value={confirmText}
                                        onChange={(e) => setConfirmText(e.target.value)}
                                        placeholder="delete"
                                        className="font-mono"
                                        onKeyDown={(e) => e.key === 'Enter' && checkConfirmText()}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setStep('password')}>Back</Button>
                                <Button
                                    variant="destructive"
                                    onClick={checkConfirmText}
                                    disabled={confirmText.toLowerCase() !== 'delete'}
                                >
                                    Continue
                                </Button>
                            </DialogFooter>
                        </>
                    )}

                    {/* Step 3: Final Confirmation with Consequences */}
                    {step === 'final-confirm' && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-red-600">
                                    <AlertTriangle className="h-5 w-5" />
                                    Final Warning
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4 space-y-3">
                                    <p className="font-semibold text-red-700 dark:text-red-400">
                                        This action will permanently delete:
                                    </p>
                                    <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400 space-y-1">
                                        <li>All products and categories</li>
                                        <li>All sales records and reports</li>
                                        <li>All user accounts (including admin)</li>
                                        <li>All uploaded images</li>
                                        <li>All settings and configurations</li>
                                        <li>Session data and security keys</li>
                                    </ul>
                                    {dataPath && (
                                        <p className="text-xs text-muted-foreground mt-2">
                                            Data location: <code className="bg-muted px-1 rounded">{dataPath}</code>
                                        </p>
                                    )}
                                </div>
                                <p className="text-sm font-medium">
                                    The app will restart with a fresh database and default admin credentials:
                                </p>
                                <div className="bg-muted p-3 rounded-lg font-mono text-sm">
                                    <div>Username: <span className="text-green-600">admin</span></div>
                                    <div>Password: <span className="text-green-600">admin123</span></div>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Are you absolutely sure you want to proceed?
                                </p>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setStep('confirm-text')}>Back</Button>
                                <Button
                                    variant="destructive"
                                    onClick={executeFactoryReset}
                                    disabled={loading}
                                    className="gap-2"
                                >
                                    {loading ? (
                                        'Resetting...'
                                    ) : (
                                        <>
                                            <Trash2 className="h-4 w-4" />
                                            Yes, Delete Everything
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
