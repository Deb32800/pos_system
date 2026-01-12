"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ArrowLeft, ArrowRight, Filter, RefreshCw } from "lucide-react"

interface StockMovement {
    id: string
    type: 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'RETURN' | 'DAMAGE' | 'TRANSFER'
    quantity: number
    reason: string
    reference: string | null
    notes: string | null
    createdAt: string
    product: {
        name: string
        sku: string
        category?: {
            name: string
        }
    }
}

export default function StockHistory() {
    const [page, setPage] = useState(1)
    const [filterType, setFilterType] = useState<string>("all")
    const [startDate, setStartDate] = useState("")
    const [endDate, setEndDate] = useState("")

    const { data, isLoading: loading, refetch } = useQuery({
        queryKey: ['movements', page, filterType, startDate, endDate],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: "20",
            })

            if (filterType && filterType !== "all") {
                params.append("type", filterType)
            }
            if (startDate) params.append("startDate", startDate)
            if (endDate) params.append("endDate", endDate)

            const res = await fetch(`/api/inventory/movements?${params.toString()}`, { cache: 'no-store' })
            if (!res.ok) throw new Error('Failed to fetch movements')
            return await res.json()
        },
        refetchOnMount: 'always',
        staleTime: 0,
    })

    const movements: StockMovement[] = data?.data || []
    const totalPages = data?.pagination?.pages || 1

    const getBadgeVariant = (type: string) => {
        switch (type) {
            case 'SALE': return 'default'
            case 'PURCHASE': return 'secondary'
            case 'RETURN': return 'outline'
            case 'DAMAGE': return 'destructive'
            default: return 'secondary'
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Stock Movement History</CardTitle>
                    <CardDescription>Track all inventory changes over time.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="w-full md:w-48">
                            <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(1); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Filter by Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="SALE">Sale</SelectItem>
                                    <SelectItem value="PURCHASE">Purchase (Restock)</SelectItem>
                                    <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                                    <SelectItem value="RETURN">Return</SelectItem>
                                    <SelectItem value="DAMAGE">Damage</SelectItem>
                                    <SelectItem value="TRANSFER">Transfer</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex gap-2 items-center">
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                                className="w-auto"
                            />
                            <span className="text-muted-foreground">-</span>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                                className="w-auto"
                            />
                        </div>
                        <div className="ml-auto">
                            <Button variant="outline" onClick={() => refetch()} disabled={loading}>
                                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Quantity</TableHead>
                                    <TableHead>Reason/Ref</TableHead>
                                    <TableHead>Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center h-24">
                                            Loading...
                                        </TableCell>
                                    </TableRow>
                                ) : movements.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                                            No movements found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    movements.map((m) => (
                                        <TableRow key={m.id}>
                                            <TableCell className="whitespace-nowrap">
                                                {format(new Date(m.createdAt), "MMM d, yyyy HH:mm")}
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium">{m.product.name}</div>
                                                <div className="text-xs text-muted-foreground">{m.product.sku}</div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={getBadgeVariant(m.type)}>{m.type}</Badge>
                                            </TableCell>
                                            <TableCell className={m.quantity > 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                                                {m.quantity > 0 ? "+" : ""}{m.quantity}
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm">{m.reason}</div>
                                                {m.reference && <div className="text-xs text-muted-foreground">{m.reference}</div>}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={m.notes || ""}>
                                                {m.notes || "-"}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="flex items-center justify-end space-x-2 py-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Previous
                        </Button>
                        <div className="text-sm text-muted-foreground">
                            Page {page} of {totalPages}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages || loading}
                        >
                            Next
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
