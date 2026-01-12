"use client"

import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string
}

function Skeleton({ className, ...props }: SkeletonProps) {
    return (
        <div
            className={cn(
                "animate-pulse rounded-md bg-gray-200",
                className
            )}
            {...props}
        />
    )
}

// Pre-built skeleton patterns for common use cases

function SkeletonCard() {
    return (
        <div className="rounded-lg border bg-white p-4 space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-3 w-full" />
        </div>
    )
}

function SkeletonProductCard() {
    return (
        <div className="rounded-lg border bg-white p-4 space-y-3">
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-6 w-1/3" />
        </div>
    )
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
    return (
        <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
            ))}
        </div>
    )
}

function SkeletonStats() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-white p-6 space-y-3">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-8 w-2/3" />
                    <Skeleton className="h-3 w-3/4" />
                </div>
            ))}
        </div>
    )
}

function SkeletonProductGrid({ count = 8 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonProductCard key={i} />
            ))}
        </div>
    )
}

function SkeletonSidebar() {
    return (
        <div className="space-y-4 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <div className="pt-4 border-t space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
    )
}

function SkeletonForm() {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-10 w-full" />
                </div>
            </div>
            <Skeleton className="h-10 w-32" />
        </div>
    )
}

export {
    Skeleton,
    SkeletonCard,
    SkeletonProductCard,
    SkeletonTable,
    SkeletonStats,
    SkeletonProductGrid,
    SkeletonSidebar,
    SkeletonForm
}
