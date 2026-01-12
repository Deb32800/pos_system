export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

interface SimilarProduct {
    id: string
    name: string
    sku: string
    barcode: string | null
    stockQuantity: number
    sellingPrice: number
    costPrice: number
    isActive: boolean
    status: 'active' | 'deleted'
    matchType: 'name' | 'sku' | 'barcode'
    category?: { id: string; name: string } | null
}

/**
 * Calculate word-based similarity score
 * Returns a score between 0 and 1
 * Uses professional matching: whole words only, minimum word length, proper scoring
 */
function calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim()
    const s2 = str2.toLowerCase().trim()

    // Exact match
    if (s1 === s2) return 1

    // Split into words, filter out very short words (less than 3 chars)
    const words1 = s1.split(/\s+/).filter(w => w.length >= 3)
    const words2 = s2.split(/\s+/).filter(w => w.length >= 3)

    // If either has no significant words, check if both are short (2-char) and equal
    if (words1.length === 0 || words2.length === 0) {
        // Only consider short names similar if they're exactly equal
        return 0
    }

    let matchCount = 0
    const matchedWords2 = new Set<number>()

    for (const w1 of words1) {
        for (let i = 0; i < words2.length; i++) {
            if (matchedWords2.has(i)) continue
            const w2 = words2[i]

            // Exact word match - full point
            if (w1 === w2) {
                matchCount += 1
                matchedWords2.add(i)
                break
            }

            // For partial matching, only match if BOTH words are 4+ chars
            // and one starts with the other (prefix match, not substring)
            if (w1.length >= 4 && w2.length >= 4) {
                if (w1.startsWith(w2) || w2.startsWith(w1)) {
                    matchCount += 0.7
                    matchedWords2.add(i)
                    break
                }
            }
        }
    }

    // Calculate score based on matched words vs total unique words
    const totalWords = Math.max(words1.length, words2.length)
    return matchCount / totalWords
}

// GET /api/products/similarity?name=...&sku=...&barcode=...&excludeId=...
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const name = searchParams.get('name')?.trim()
        const sku = searchParams.get('sku')?.trim()
        const barcode = searchParams.get('barcode')?.trim()
        const excludeId = searchParams.get('excludeId')?.trim() // Exclude current product when editing

        const results: {
            nameMatches: SimilarProduct[]
            skuMatch: SimilarProduct | null
            barcodeMatch: SimilarProduct | null
        } = {
            nameMatches: [],
            skuMatch: null,
            barcodeMatch: null,
        }

        // SKU exact match (including deleted products)
        if (sku && sku.length > 0) {
            const skuProduct = await db.product.findUnique({
                where: { sku },
                include: { category: { select: { id: true, name: true } } },
            })

            if (skuProduct && skuProduct.id !== excludeId) {
                results.skuMatch = {
                    id: skuProduct.id,
                    name: skuProduct.name,
                    sku: skuProduct.sku,
                    barcode: skuProduct.barcode,
                    stockQuantity: skuProduct.stockQuantity,
                    sellingPrice: skuProduct.sellingPrice,
                    costPrice: skuProduct.costPrice,
                    isActive: skuProduct.isActive,
                    status: skuProduct.isActive ? 'active' : 'deleted',
                    matchType: 'sku',
                    category: skuProduct.category,
                }
            }
        }

        // Barcode exact match (including deleted products)
        if (barcode && barcode.length > 0) {
            const barcodeProduct = await db.product.findUnique({
                where: { barcode },
                include: { category: { select: { id: true, name: true } } },
            })

            if (barcodeProduct && barcodeProduct.id !== excludeId) {
                results.barcodeMatch = {
                    id: barcodeProduct.id,
                    name: barcodeProduct.name,
                    sku: barcodeProduct.sku,
                    barcode: barcodeProduct.barcode,
                    stockQuantity: barcodeProduct.stockQuantity,
                    sellingPrice: barcodeProduct.sellingPrice,
                    costPrice: barcodeProduct.costPrice,
                    isActive: barcodeProduct.isActive,
                    status: barcodeProduct.isActive ? 'active' : 'deleted',
                    matchType: 'barcode',
                    category: barcodeProduct.category,
                }
            }
        }

        // Name fuzzy search (including deleted products)
        if (name && name.length >= 2) {
            // Get all products and filter by similarity
            // For SQLite, we do this in-memory since it doesn't have fuzzy search
            const allProducts = await db.product.findMany({
                where: excludeId ? { NOT: { id: excludeId } } : undefined,
                include: { category: { select: { id: true, name: true } } },
                take: 500, // Reasonable limit for performance
            })

            const similarProducts = allProducts
                .map((p: typeof allProducts[0]) => ({
                    product: p,
                    similarity: calculateSimilarity(name, p.name),
                }))
                .filter((x: { product: typeof allProducts[0]; similarity: number }) => x.similarity >= 0.5) // 50% threshold for "similar"
                .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity)
                .slice(0, 8) // Top 8 matches

            results.nameMatches = similarProducts.map((x: { product: typeof allProducts[0]; similarity: number }) => ({
                id: x.product.id,
                name: x.product.name,
                sku: x.product.sku,
                barcode: x.product.barcode,
                stockQuantity: x.product.stockQuantity,
                sellingPrice: x.product.sellingPrice,
                costPrice: x.product.costPrice,
                isActive: x.product.isActive,
                status: x.product.isActive ? 'active' : 'deleted',
                matchType: 'name' as const,
                category: x.product.category,
                similarity: x.similarity, // Include similarity score
            }))
        }

        return NextResponse.json({ data: results })
    } catch (error) {
        console.error('Error searching similar products:', error)
        return NextResponse.json(
            { error: 'Failed to search products' },
            { status: 500 }
        )
    }
}
