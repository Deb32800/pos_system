import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/products/lookup?barcode=...
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const barcode = searchParams.get('barcode')

        if (!barcode) {
            return NextResponse.json(
                { error: 'Barcode is required' },
                { status: 400 }
            )
        }

        // 1. Check local database
        const localProduct = await db.product.findUnique({
            where: { barcode },
            include: { category: true }
        })

        if (localProduct) {
            return NextResponse.json({
                found: true,
                source: 'local',
                product: localProduct
            })
        }

        // 2. Check external API if configured
        const settings = await db.setting.findMany({
            where: { key: { in: ['externalApiUrl', 'externalApiKey'] } }
        })

        const externalApiUrl = settings.find(s => s.key === 'externalApiUrl')?.value
        const externalApiKey = settings.find(s => s.key === 'externalApiKey')?.value

        if (externalApiUrl) {
            try {
                // Detect if this is an OpenFacts URL to enable multi-database search
                const isOpenFacts = externalApiUrl.includes('openfoodfacts.org') ||
                    externalApiUrl.includes('openpetfoodfacts.org') ||
                    externalApiUrl.includes('openbeautyfacts.org')

                let urlsToTry = [externalApiUrl]

                // If it's OpenFacts, try all siblings in PARALLEL for speed
                if (isOpenFacts) {
                    urlsToTry = [
                        'https://world.openpetfoodfacts.org/api/v0/product/{barcode}.json',
                        'https://world.openfoodfacts.org/api/v0/product/{barcode}.json',
                        'https://world.openbeautyfacts.org/api/v0/product/{barcode}.json'
                    ]
                }

                // Helper function to fetch a single URL
                const fetchProduct = async (urlTemplate: string) => {
                    let apiUrl = urlTemplate.replace('{barcode}', barcode)
                    if (externalApiKey) {
                        apiUrl = apiUrl.replace('{key}', externalApiKey)
                    }

                    const headers: HeadersInit = { 'Accept': 'application/json' }
                    if (externalApiKey) {
                        headers['Authorization'] = `Bearer ${externalApiKey}`
                        headers['X-Api-Key'] = externalApiKey
                    }

                    try {
                        const response = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(5000) }) // 5s timeout per request
                        if (!response.ok) return null

                        const json = await response.json()
                        // OpenFacts specific check
                        if (isOpenFacts && json.status === 0) return null

                        // Normalize data
                        let item = json
                        if (json.items && Array.isArray(json.items) && json.items.length > 0) item = json.items[0]
                        else if (json.products && Array.isArray(json.products) && json.products.length > 0) item = json.products[0]
                        else if (json.product && typeof json.product === 'object') item = json.product

                        const name = item.name || item.title || item.product_name || ''
                        const description = item.description || item.generic_name || ''
                        const price = item.price || item.sellingPrice || item.lowest_recorded_price || 0
                        const image = item.image || item.imageUrl || item.imagePath || item.image_url || item.image_front_url || (item.images && item.images[0]) || null

                        // Scoring
                        let score = 0
                        const isUnknownName = !name || name.toLowerCase().includes('unknown product') || name.trim() === ''

                        if (!isUnknownName) score += 2
                        if (image) score += 3
                        if (description) score += 1

                        if (score < 2) return null // Filter low quality

                        return {
                            score,
                            product: {
                                name: isUnknownName ? 'Scanned Product' : name,
                                description,
                                sellingPrice: price,
                                barcode: barcode,
                                sku: item.sku || barcode,
                                imagePath: image,
                                // Default values for required fields
                                costPrice: 0,
                                taxPercent: 0,
                                stockQuantity: 0,
                                minStockLevel: 0,
                                isActive: true,
                                categoryId: null
                            }
                        }
                    } catch (e) {
                        return null
                    }
                }

                // Execute fetches in parallel
                const results = await Promise.all(urlsToTry.map(url => fetchProduct(url)))

                // Find best result
                const validResults = results.filter(r => r !== null) as { score: number, product: any }[]
                validResults.sort((a, b) => b.score - a.score) // Sort by score descending

                if (validResults.length > 0) {
                    return NextResponse.json({
                        found: true,
                        source: 'external',
                        product: validResults[0].product
                    })
                }
            } catch (apiError) {
                console.error('External API fetch error:', apiError)
                // Continue to return not found if API fails
            }
        }

        return NextResponse.json({ found: false })
    } catch (error) {
        console.error('Error looking up product:', error)
        return NextResponse.json(
            { error: 'Failed to lookup product' },
            { status: 500 }
        )
    }
}
