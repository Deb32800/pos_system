"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ChevronDown, ChevronRight, Settings } from "lucide-react"
import { FactoryResetButton } from "./factory-reset-button"

export function DangerZoneSection() {
    const [isExpanded, setIsExpanded] = useState(false)

    return (
        <>
            <Separator className="my-6" />
            <div className="space-y-4">
                {/* Collapsed header - click to expand */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                >
                    {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                    <Settings className="h-4 w-4" />
                    <span>Advanced Settings</span>
                </button>

                {/* Expanded content with Factory Reset */}
                {isExpanded && (
                    <div className="pl-6 border-l-2 border-muted space-y-4 animate-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center justify-between p-4 rounded-lg border border-dashed border-muted-foreground/30">
                            <div>
                                <h3 className="text-sm font-medium text-muted-foreground">Danger Zone</h3>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Factory reset will permanently delete all data.
                                </p>
                            </div>
                            <FactoryResetButton />
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}
