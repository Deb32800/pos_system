"use client"

import type React from "react"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Store,
  LogOut,
  Package,
  Scan,
  RotateCcw,
  Wifi,
  WifiOff,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { useRouter } from "next/navigation"
import Receipt from "@/components/receipt"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import { useSettings } from "@/components/settings-provider"
import { printReceipt, isElectron } from "@/lib/hardware"

interface Product {
  id: string
  name: string
  sku: string
  barcode?: string
  price: number
  stock_quantity: number
  category_name?: string
  imagePath?: string | null
  taxPercent?: number
}

interface Category {
  id: string
  name: string
}

interface CartItem extends Product {
  quantity: number
}

interface StaffDashboardProps {
  user: any
}

export default function StaffDashboard({ user }: StaffDashboardProps) {
  const { formatCurrency, settings } = useSettings()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [activeView, setActiveView] = useState<"sales" | "return">("sales")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [processing, setProcessing] = useState(false)
  const [skuInput, setSkuInput] = useState("")
  const [lastSale, setLastSale] = useState<any>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const returnInputRef = useRef<HTMLInputElement>(null)
  const salesInputRef = useRef<HTMLInputElement>(null)

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products-pos'],
    queryFn: async () => {
      // Load top 100 products initially - use search/barcode for others
      const res = await fetch('/api/products?limit=100', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch products')
      const json = await res.json()
      return json.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        price: p.sellingPrice,
        stock_quantity: p.stockQuantity,
        category_name: p.category?.name,
        imagePath: p.imagePath,
        taxPercent: p.taxPercent
      })) as Product[]
    },
    refetchOnMount: 'always',
    staleTime: 0,
  })

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch categories')
      const json = await res.json()
      return json.data as Category[]
    },
    refetchOnMount: 'always',
    staleTime: 0,
  })

  // Fetch returnable quantities for return view
  const { data: returnableQuantities = {}, refetch: refetchReturnable } = useQuery<Record<string, number>>({
    queryKey: ['returnable-quantities'],
    queryFn: async () => {
      const res = await fetch('/api/products/returnable', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch returnable quantities')
      const json = await res.json()
      return json.data
    },
    refetchOnMount: 'always',
    staleTime: 0,
  })

  // Refetch returnable quantities when switching to return view
  // Refetch returnable quantities and focus input when switching to return view
  useEffect(() => {
    if (activeView === 'return') {
      refetchReturnable()
      // Auto-focus the scan input
      setTimeout(() => returnInputRef.current?.focus(), 100)
    }
  }, [activeView, refetchReturnable])

  const isLoading = productsLoading || categoriesLoading

  // Cart Persistence
  useEffect(() => {
    const savedCart = localStorage.getItem("pos-cart")
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart))
      } catch (e) {
        console.error("Failed to parse cart", e)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem("pos-cart", JSON.stringify(cart))
  }, [cart])

  // Auto-focus on barcode input after 5 seconds of inactivity
  useEffect(() => {
    let idleTimer: NodeJS.Timeout

    const resetIdleTimer = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        // Auto-focus appropriate input based on current view
        if (activeView === 'return') {
          returnInputRef.current?.focus()
        } else {
          salesInputRef.current?.focus()
        }
      }, 5000) // 5 seconds idle
    }

    // Listen for any user activity
    window.addEventListener('mousemove', resetIdleTimer)
    window.addEventListener('keydown', resetIdleTimer)
    window.addEventListener('click', resetIdleTimer)

    // Start the timer
    resetIdleTimer()

    return () => {
      clearTimeout(idleTimer)
      window.removeEventListener('mousemove', resetIdleTimer)
      window.removeEventListener('keydown', resetIdleTimer)
      window.removeEventListener('click', resetIdleTimer)
    }
  }, [activeView])

  // Universal Barcode Scanner Listener
  // Works with USB, Bluetooth, and wireless scanners
  // Captures any rapid input and routes to barcode field
  useEffect(() => {
    let buffer = ""
    let lastKeyTime = Date.now()

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now()
      const timeSinceLastKey = currentTime - lastKeyTime
      lastKeyTime = currentTime

      const currentTarget = e.target as HTMLElement
      const isInBarcodeInput = currentTarget === salesInputRef.current || currentTarget === returnInputRef.current
      const isInOtherInput = currentTarget.tagName === 'INPUT' || currentTarget.tagName === 'TEXTAREA'

      // Reset buffer if more than 150ms between keystrokes (scanner is much faster)
      if (timeSinceLastKey > 150) {
        buffer = ""
      }

      if (e.key === 'Enter') {
        // If we have scanner buffer (at least 3 chars), process it
        if (buffer.length >= 3) {
          // Only prevent default if NOT in barcode input (let form handle it there)
          if (!isInBarcodeInput) {
            e.preventDefault()
            e.stopPropagation()
          }

          // Redirect to appropriate handler based on view
          if (activeView === 'return') {
            lookupProductForReturn(buffer)
            setReturnSkuInput("")
            setTimeout(() => returnInputRef.current?.focus(), 100)
          } else {
            lookupProduct(buffer)
            setSkuInput("")
            setTimeout(() => salesInputRef.current?.focus(), 100)
          }
          buffer = ""
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Build buffer from printable characters
        // If we're in another input (not barcode), and it looks like scanner input, capture it
        if (isInOtherInput && !isInBarcodeInput && timeSinceLastKey < 80 && buffer.length > 0) {
          e.preventDefault()
          e.stopPropagation()
        }
        buffer += e.key
      }
    }

    window.addEventListener('keydown', handleKeyDown, true) // Use capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [products, activeView, returnableQuantities])

  const lookupProduct = async (code: string) => {
    // 1. Try local products array first (fastest)
    const localProduct = products.find(p => p.sku === code || p.id === code || p.barcode === code)
    if (localProduct) {
      addToCart(localProduct)
      toast.success(`Added ${localProduct.name}`)
      return
    }

    // 2. Call API
    try {
      const res = await fetch(`/api/products/lookup?barcode=${code}`)
      const data = await res.json()

      if (data.found) {
        if (data.source === 'local') {
          // If found locally via API but not in our list, it might be new or list is stale
          // Construct a product object from the API response and add to cart
          const p = data.product

          if (p.stockQuantity <= 0) {
            toast.error(`Product ${p.name} is out of stock`)
            return
          }

          const newProduct: Product = {
            id: p.id,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            price: p.sellingPrice,
            stock_quantity: p.stockQuantity,
            category_name: p.category?.name,
            imagePath: p.imagePath,
            taxPercent: p.taxPercent
          }
          addToCart(newProduct)
          toast.success(`Added ${newProduct.name}`)
          // Also refresh to update the list for next time
          router.refresh()
        } else {
          // External source
          toast.success(`Found online: ${data.product.name}`)
          // Redirect to add product with pre-filled data
          const params = new URLSearchParams({
            name: data.product.name,
            price: data.product.sellingPrice.toString(),
            sku: data.product.sku,
            description: data.product.description,
            image: data.product.imagePath || ''
          })
          router.push(`/staff/inventory/new?${params.toString()}`)
        }
      } else {
        toast.error("Product not found. Please enter manually.")
        router.push(`/staff/inventory/new?sku=${code}`)
      }
    } catch (e) {
      toast.error("Error looking up product")
    }
  }

  const handleScan = (code: string) => {
    if (activeView === 'return') {
      lookupProductForReturn(code)
    } else {
      lookupProduct(code)
    }
  }

  const [returnSearchTerm, setReturnSearchTerm] = useState("")
  const [returnCart, setReturnCart] = useState<CartItem[]>([])
  const [returnReason, setReturnReason] = useState("defective")
  const [returnSkuInput, setReturnSkuInput] = useState("")
  const [scannedReturnProduct, setScannedReturnProduct] = useState<Product | null>(null)
  const [scannedMaxReturnable, setScannedMaxReturnable] = useState(0)
  const [scannedQuantity, setScannedQuantity] = useState(1)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-search with debounce when typing stops (for barcode scanners)
  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Only auto-search if there's input and we're in return view
    if (returnSkuInput.trim().length >= 3 && activeView === 'return') {
      debounceTimerRef.current = setTimeout(() => {
        lookupProductForReturn(returnSkuInput.trim())
        setReturnSkuInput("")
        setTimeout(() => returnInputRef.current?.focus(), 100)
      }, 400) // 400ms delay after typing stops
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [returnSkuInput, activeView])

  // Lookup product for return - shows preview, increments quantity if same product
  const lookupProductForReturn = async (code: string) => {
    try {
      // First check local products (fastest)
      const localProduct = products.find(p => p.sku === code || p.id === code || p.barcode === code)
      if (localProduct) {
        const maxReturnable = returnableQuantities[localProduct.id] || 0
        if (maxReturnable <= 0) {
          toast.error(`Cannot return ${localProduct.name}: Nothing sold or already fully returned`)
          setScannedReturnProduct(null)
          setScannedQuantity(1)
          return
        }

        // If same product scanned again, increment quantity
        if (scannedReturnProduct?.id === localProduct.id) {
          const newQty = Math.min(scannedQuantity + 1, maxReturnable)
          setScannedQuantity(newQty)
          if (newQty > scannedQuantity) {
            toast.success(`Quantity: ${newQty}`)
          } else {
            toast.error(`Max returnable reached: ${maxReturnable}`)
          }
        } else {
          setScannedReturnProduct(localProduct)
          setScannedMaxReturnable(maxReturnable)
          setScannedQuantity(1)
          toast.success(`Found: ${localProduct.name}`)
        }
        return
      }

      // Try API lookup
      const res = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(code)}`)
      const data = await res.json()

      // API returns { found: true, product: {...} }
      if (res.ok && data.found && data.product) {
        const product = data.product
        const maxReturnable = returnableQuantities[product.id] || 0
        if (maxReturnable <= 0) {
          toast.error(`Cannot return ${product.name || 'this product'}: Nothing sold or already fully returned`)
          setScannedReturnProduct(null)
          setScannedQuantity(1)
          return
        }
        // Convert to Product format
        const productForReturn: Product = {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          price: product.sellingPrice,
          stock_quantity: product.stockQuantity,
          category_name: product.category?.name,
          imagePath: product.imagePath,
          taxPercent: product.taxPercent
        }

        // If same product scanned again, increment quantity
        if (scannedReturnProduct?.id === product.id) {
          const newQty = Math.min(scannedQuantity + 1, maxReturnable)
          setScannedQuantity(newQty)
          if (newQty > scannedQuantity) {
            toast.success(`Quantity: ${newQty}`)
          } else {
            toast.error(`Max returnable reached: ${maxReturnable}`)
          }
        } else {
          setScannedReturnProduct(productForReturn)
          setScannedMaxReturnable(maxReturnable)
          setScannedQuantity(1)
          toast.success(`Found: ${product.name}`)
        }
      } else {
        toast.error("Product not found")
        setScannedReturnProduct(null)
        setScannedQuantity(1)
      }
    } catch (e) {
      toast.error("Error looking up product for return")
      setScannedReturnProduct(null)
      setScannedQuantity(1)
    }
  }

  // Add scanned product to return cart with quantity
  const addScannedToReturnCart = () => {
    if (!scannedReturnProduct) return

    // Add to cart with the scanned quantity
    setReturnCart(prev => {
      const existing = prev.find(item => item.id === scannedReturnProduct.id)
      if (existing) {
        const newQty = Math.min(existing.quantity + scannedQuantity, scannedMaxReturnable)
        return prev.map(item =>
          item.id === scannedReturnProduct.id
            ? { ...item, quantity: newQty }
            : item
        )
      }
      return [...prev, { ...scannedReturnProduct, quantity: scannedQuantity }]
    })

    toast.success(`Added ${scannedQuantity}x ${scannedReturnProduct.name} for return`)
    setScannedReturnProduct(null)
    setScannedMaxReturnable(0)
    setScannedQuantity(1)
  }

  const handleReturnSkuSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!returnSkuInput.trim()) return
    await lookupProductForReturn(returnSkuInput.trim())
    setReturnSkuInput("")
    // Keep input focused for next scan
    setTimeout(() => returnInputRef.current?.focus(), 100)
  }

  const handleSkuSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!skuInput.trim()) return

    await lookupProduct(skuInput.trim())
    setSkuInput("")
  }

  const addToCart = (product: Product) => {
    if (product.stock_quantity <= 0) {
      toast.error(`Cannot add ${product.name}: Out of stock`)
      return
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id)
      if (existing) {
        if (existing.quantity < product.stock_quantity) {
          return prev.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
        } else {
          toast.error(`Cannot add more ${product.name}: Stock limit reached`)
          return prev
        }
      }
      return [...prev, { ...product, quantity: 1 }]
    })
  }

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity === 0) {
      setCart((prev) => prev.filter((item) => item.id !== productId))
    } else {
      setCart((prev) =>
        prev.map((item) => {
          if (item.id === productId) {
            const maxQuantity = products.find((p) => p.id === productId)?.stock_quantity || 0
            return { ...item, quantity: Math.min(newQuantity, maxQuantity) }
          }
          return item
        }),
      )
    }
  }

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId))
  }

  const clearCart = () => {
    setCart([])
  }

  // Memoize cart total to avoid recalculating on every render
  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.price * item.quantity, 0)
  }, [cart])

  // Memoize cart calculations for sales view
  const cartCalculations = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const totalTax = cart.reduce((sum, item) => {
      const taxRate = (item.taxPercent || 0) / 100
      return sum + (item.price * item.quantity * taxRate)
    }, 0)
    const totalWithTax = subtotal + totalTax
    return { subtotal, totalTax, totalWithTax }
  }, [cart])

  // Memoize return cart calculations  
  const returnCartCalculations = useMemo(() => {
    const subtotal = returnCart.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const totalTax = returnCart.reduce((sum, item) => {
      const taxRate = (item.taxPercent || 0) / 100
      return sum + (item.price * item.quantity * taxRate)
    }, 0)
    const totalWithTax = subtotal + totalTax
    return { subtotal, totalTax, totalWithTax }
  }, [returnCart])

  const [isReaderConnected, setIsReaderConnected] = useState(false)
  const [stripeTerminal, setStripeTerminal] = useState<any>(null)
  const [connectedReader, setConnectedReader] = useState<any>(null)
  const [connectingReader, setConnectingReader] = useState(false)

  // Initialize Stripe Terminal on load
  useEffect(() => {
    if (settings.paymentProvider === 'Stripe' && settings.stripe_pk && !stripeTerminal) {
      initStripeTerminal()
    }
  }, [settings.paymentProvider, settings.stripe_pk])

  // Initialize Stripe Terminal SDK
  const initStripeTerminal = async () => {
    try {
      // Load Stripe Terminal SDK dynamically
      const { loadStripeTerminal } = await import('@stripe/terminal-js')

      const terminal = await loadStripeTerminal()
      if (!terminal) {
        console.error('Failed to load Stripe Terminal')
        return
      }

      const terminalInstance = terminal.create({
        onFetchConnectionToken: async () => {
          const response = await fetch('/api/stripe/connection-token', { method: 'POST' })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error)
          return data.secret
        },
        onUnexpectedReaderDisconnect: () => {
          toast.error('Reader disconnected unexpectedly')
          setIsReaderConnected(false)
          setConnectedReader(null)
        }
      })

      setStripeTerminal(terminalInstance)
    } catch (error: any) {
      console.error('Failed to initialize Stripe Terminal:', error)
    }
  }

  // Connect to payment terminal reader (Stripe)
  const connectReader = async (silent = false) => {
    if (settings.paymentProvider !== 'Stripe') {
      if (!silent) toast.error('Stripe not configured. Go to Settings → Hardware → Payment Terminal.')
      return false
    }

    if (!stripeTerminal) {
      if (!silent) toast.error('Stripe Terminal not initialized. Please refresh the page.')
      return false
    }

    if (isReaderConnected) {
      if (!silent) toast.info('Reader already connected')
      return true
    }

    setConnectingReader(true)
    const toastId = !silent ? toast.loading('Discovering readers...') : undefined

    try {
      const isSimulated = settings.stripe_simulate === 'true'
      const discoverResult = await stripeTerminal.discoverReaders({
        simulated: isSimulated,
        location: settings.stripe_location || undefined
      })

      if (discoverResult.error) {
        if (!silent) {
          toast.dismiss(toastId)
          toast.error(discoverResult.error.message)
        }
        setConnectingReader(false)
        return false
      }

      if (discoverResult.discoveredReaders.length === 0) {
        if (!silent) {
          toast.dismiss(toastId)
          if (isSimulated) {
            toast.error('Simulated reader not available. Make sure "Test Mode" is enabled in Settings.')
          } else {
            toast.error('No readers found. Make sure your Stripe reader is powered on and connected to WiFi.')
          }
        }
        setConnectingReader(false)
        return false
      }

      // Connect to first available reader
      const reader = discoverResult.discoveredReaders[0]
      if (!silent) toast.loading(`Connecting to ${reader.label || reader.serial_number || 'Reader'}...`, { id: toastId })

      const connectResult = await stripeTerminal.connectReader(reader)

      if (connectResult.error) {
        if (!silent) {
          toast.dismiss(toastId)
          toast.error(connectResult.error.message)
        }
        setConnectingReader(false)
        return false
      }

      setConnectedReader(connectResult.reader)
      setIsReaderConnected(true)
      setConnectingReader(false)

      if (!silent) {
        toast.dismiss(toastId)
        const readerName = reader.label || reader.serial_number || (isSimulated ? 'Simulated Reader' : 'Stripe Reader')
        toast.success(`Connected to ${readerName}`)
      }
      return true
    } catch (error: any) {
      if (!silent) {
        toast.dismiss(toastId)
        toast.error(error.message || 'Failed to connect to reader')
      }
      setConnectingReader(false)
      return false
    }
  }

  // Disconnect reader
  const disconnectReader = async () => {
    if (!stripeTerminal || !isReaderConnected) return

    try {
      await stripeTerminal.disconnectReader()
      setIsReaderConnected(false)
      setConnectedReader(null)
      toast.success('Reader disconnected')
    } catch (error: any) {
      toast.error('Failed to disconnect reader')
    }
  }

  const processSale = async () => {
    if (cart.length === 0) return

    setProcessing(true)
    try {
      // Variable to store Stripe payment intent ID for card payments
      let stripePaymentIntentId: string | undefined = undefined

      // 1. Handle Card Payment - Requires Stripe Terminal
      if (paymentMethod === 'card') {
        // Check if Stripe is configured
        if (settings.paymentProvider !== 'Stripe') {
          toast.error("Card payments require Stripe Terminal setup. Go to Settings → Hardware → Payment Terminal.")
          setProcessing(false)
          return
        }

        // Check if reader is connected
        if (!isReaderConnected || !stripeTerminal) {
          toast.error("Card reader not connected. Click 'Connect Reader' in the sidebar first.")
          setProcessing(false)
          return
        }

        // Create payment intent
        const { totalWithTax } = cartCalculations
        const piResponse = await fetch('/api/stripe/payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: totalWithTax,
            currency: settings.currency?.toLowerCase() || 'aud'
          })
        })

        const piData = await piResponse.json()
        if (!piResponse.ok) {
          toast.error(piData.error || 'Failed to create payment')
          setProcessing(false)
          return
        }

        // Store the payment intent ID for linking with sale
        stripePaymentIntentId = piData.paymentIntentId

        toast.loading('Waiting for card on reader...')

        // Collect payment method from reader
        const collectResult = await stripeTerminal.collectPaymentMethod(piData.clientSecret)

        if (collectResult.error) {
          toast.dismiss()
          toast.error(collectResult.error.message)
          setProcessing(false)
          return
        }

        // Process the payment
        const processResult = await stripeTerminal.processPayment(collectResult.paymentIntent)

        toast.dismiss()

        if (processResult.error) {
          toast.error(processResult.error.message)
          setProcessing(false)
          return
        }

        if (processResult.paymentIntent.status === 'succeeded') {
          toast.success('Payment Approved')
        } else {
          toast.error('Payment not completed')
          setProcessing(false)
          return
        }
      }

      // Build sale data - include Stripe payment intent ID if card payment
      const saleData: {
        items: Array<{ productId: string; quantity: number; unitPrice: number; totalPrice: number; discount: number }>;
        paymentMethod: string;
        discountAmount: number;
        notes: string;
        cashierId: string;
        stripePaymentIntentId?: string;
      } = {
        items: cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity,
          discount: 0,
        })),
        paymentMethod: paymentMethod.toUpperCase(),
        discountAmount: 0,
        notes: '',
        cashierId: user?.id || 'unknown',
        stripePaymentIntentId, // Include the Stripe payment intent ID if available
      }

      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saleData),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to process sale')
      }

      setLastSale(result.data)
      setShowReceipt(true)

      // Handle Auto-Print based on printer settings
      if (settings.printerType && settings.printerType !== 'BrowserPrint') {
        // Use ESC/POS printing for network/USB/serial printers
        toast.info(`Sending to printer...`)
        // Convert settings to Record<string, string>, filtering out undefined values
        const printSettings: Record<string, string> = {}
        Object.entries(settings).forEach(([key, value]) => {
          if (value !== undefined) {
            printSettings[key] = value
          }
        })
        const printResult = await printReceipt(result.data, printSettings)
        if (printResult.success) {
          toast.success('Receipt printed!')
        } else if (printResult.error) {
          toast.error(`Print failed: ${printResult.error}`)
        }
      }
      // For Browser Print, the Receipt component handles it via the print button

      clearCart()
      localStorage.removeItem("pos-cart")
      toast.success("Sale processed successfully!")
      queryClient.invalidateQueries({ queryKey: ['products-pos'] })
      queryClient.invalidateQueries({ queryKey: ['returnable-quantities'] })
      // Refocus barcode input for next sale
      setTimeout(() => salesInputRef.current?.focus(), 200)
    } catch (error) {
      console.error("Error processing sale:", error)
      toast.error(`Error processing sale: ${error instanceof Error ? error.message : 'Please try again.'}`)
    } finally {
      setProcessing(false)
    }
  }

  const addToReturnCart = (product: Product) => {
    setReturnCart((prev) => {
      const existing = prev.find((item) => item.id === product.id)
      if (existing) {
        return prev.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
      }
      return [...prev, { ...product, quantity: 1 }]
    })
  }

  const updateReturnQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity === 0) {
      setReturnCart((prev) => prev.filter((item) => item.id !== productId))
    } else {
      setReturnCart((prev) => prev.map((item) => (item.id === productId ? { ...item, quantity: newQuantity } : item)))
    }
  }

  const removeFromReturnCart = (productId: string) => {
    setReturnCart((prev) => prev.filter((item) => item.id !== productId))
  }

  const clearReturnCart = () => {
    setReturnCart([])
  }

  const processReturn = async () => {
    if (returnCart.length === 0) return

    setProcessing(true)
    try {
      // Process each return item individually
      for (const item of returnCart) {
        const returnData = {
          productId: item.id,
          quantity: item.quantity,
          type: 'RETURN' as const,
          reason: returnReason,
          reference: `RET-${Date.now()}`,
          notes: `Return for ${item.name}`,
        }

        const response = await fetch('/api/inventory/adjustment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(returnData),
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Failed to process return')
        }
      }

      setReturnCart([])
      toast.success(`Return processed successfully! ${returnCart.length} items returned.`)
      queryClient.invalidateQueries({ queryKey: ['products-pos'] })
      queryClient.invalidateQueries({ queryKey: ['returnable-quantities'] })
    } catch (error) {
      console.error("Error processing return:", error)
      toast.error(`Error processing return: ${error instanceof Error ? error.message : 'Please try again.'}`)
    } finally {
      setProcessing(false)
    }
  }

  // Memoize filtered products to avoid recalculating on every render
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const searchValue = activeView === "sales" ? searchTerm : returnSearchTerm
      const matchesSearch =
        product.name.toLowerCase().includes(searchValue.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchValue.toLowerCase())
      const matchesCategory = selectedCategory === "all" || product.category_name === selectedCategory

      // Hide out of stock items in sales view
      const matchesStock = activeView === "sales" ? product.stock_quantity > 0 : true

      // In returns view, hide products with 0 returnable quantity
      const matchesReturnable = activeView === "return"
        ? (returnableQuantities[product.id] || 0) > 0
        : true

      return matchesSearch && matchesCategory && matchesStock && matchesReturnable
    })
  }, [products, searchTerm, returnSearchTerm, selectedCategory, activeView, returnableQuantities])

  const renderSalesView = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            Add Product
          </CardTitle>
          <CardDescription>Scan Barcode / Enter SKU (auto-adds to cart)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSkuSubmit} className="flex gap-4">
            <Input
              ref={salesInputRef}
              placeholder="Scan Barcode / Enter SKU..."
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                // Auto-submit on Enter (barcode scanners send Enter after scan)
                if (e.key === 'Enter' && skuInput.trim()) {
                  e.preventDefault()
                  handleSkuSubmit(e as any)
                }
              }}
              onPaste={(e) => {
                // Auto-lookup when barcode is pasted
                const pasted = e.clipboardData.getData('text').trim()
                if (pasted.length >= 3) {
                  e.preventDefault()
                  setSkuInput(pasted)
                  lookupProduct(pasted)
                  setTimeout(() => setSkuInput(''), 100)
                }
              }}
              className="flex-1"
            />
            <Button type="submit">
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Products
          </CardTitle>
          <CardDescription>Browse and search all products</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48 hidden md:flex">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="hidden md:grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <Card key={product.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="space-y-2">
                    {product.imagePath ? (
                      <img src={product.imagePath} alt={product.name} className="w-full h-28 object-cover rounded" />
                    ) : (
                      <div className="w-full h-28 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">
                        No image
                      </div>
                    )}
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold">{product.name}</h3>
                      <Badge variant="secondary">{product.category_name || "Uncategorized"}</Badge>
                    </div>
                    <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold">{formatCurrency(product.price)}</span>
                      <span className="text-xs text-gray-500">{product.stock_quantity} in stock</span>
                    </div>
                    <Button onClick={() => addToCart(product)} className="w-full" size="sm">
                      <Plus className="mr-2 h-3 w-3" />
                      Add to Cart
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-semibold mb-2">No products found</h3>
              <p className="text-gray-500">Try adjusting your search or filters</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderReturnView = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            Return Product
          </CardTitle>
          <CardDescription>Scan barcode or enter SKU to process return</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Scan Input */}
          <form onSubmit={handleReturnSkuSubmit} className="flex gap-4">
            <Input
              ref={returnInputRef}
              placeholder="Scan Barcode / Enter SKU..."
              value={returnSkuInput}
              onChange={(e) => setReturnSkuInput(e.target.value)}
              className="flex-1"
              autoFocus
            />
            <Button type="submit" variant="secondary">
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </form>

          {/* Scanned Product Preview */}
          {scannedReturnProduct && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="flex gap-4">
                {/* Product Image */}
                <div className="flex-shrink-0">
                  {scannedReturnProduct.imagePath ? (
                    <img
                      src={scannedReturnProduct.imagePath}
                      alt={scannedReturnProduct.name}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-gray-200 rounded-lg flex items-center justify-center">
                      <Package className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Product Details */}
                <div className="flex-1 space-y-2">
                  <h3 className="text-lg font-semibold">{scannedReturnProduct.name}</h3>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>SKU: {scannedReturnProduct.sku}</span>
                    {scannedReturnProduct.barcode && <span>Barcode: {scannedReturnProduct.barcode}</span>}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-bold">{formatCurrency(scannedReturnProduct.price)}</span>
                    <Badge variant="secondary">{scannedReturnProduct.category_name || 'Uncategorized'}</Badge>
                    <Badge variant="outline" className="text-green-600">Max: {scannedMaxReturnable}</Badge>
                    <Badge variant="default" className="bg-blue-600">Qty: {scannedQuantity}</Badge>
                  </div>
                </div>
              </div>

              {/* Return Reason & Add Button */}
              <div className="flex gap-4 mt-4 pt-4 border-t">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Return Reason</label>
                  <Select value={returnReason} onValueChange={setReturnReason}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="defective">Defective Product</SelectItem>
                      <SelectItem value="wrong-item">Wrong Item</SelectItem>
                      <SelectItem value="customer-request">Customer Request</SelectItem>
                      <SelectItem value="damaged">Damaged</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={addScannedToReturnCart} size="lg">
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Add for Return
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!scannedReturnProduct && (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              <Scan className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">Scan a product barcode to begin</p>
              <p className="text-sm">Enter SKU or barcode above to search</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderCartSidebar = () => {
    const currentCart = activeView === "sales" ? cart : returnCart

    // Use memoized calculations
    const { subtotal, totalTax, totalWithTax } = activeView === "sales"
      ? cartCalculations
      : returnCartCalculations

    const updateQuantityFn = activeView === "sales" ? updateQuantity : updateReturnQuantity
    const removeFromCartFn = activeView === "sales" ? removeFromCart : removeFromReturnCart
    const clearCartFn = activeView === "sales" ? clearCart : clearReturnCart
    const processAction = activeView === "sales" ? processSale : processReturn

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            {activeView === "sales" ? (
              <>
                <ShoppingCart className="h-5 w-5" />
                Cart
              </>
            ) : (
              <>
                <RotateCcw className="h-5 w-5" />
                Return Items
              </>
            )}
          </h2>
          {currentCart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCartFn} className="text-red-500">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {currentCart.length > 0 ? (
            currentCart.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg">
                {item.imagePath ? (
                  <img src={item.imagePath} alt={item.name} className="h-12 w-12 object-cover rounded" />
                ) : (
                  <div className="h-12 w-12 bg-gray-100 rounded flex items-center justify-center text-[10px] text-gray-500">
                    No image
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-gray-500">{formatCurrency(item.price)} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateQuantityFn(item.id, item.quantity - 1)}
                    className="h-8 w-8 p-0"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center font-semibold">{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateQuantityFn(item.id, item.quantity + 1)}
                    className="h-8 w-8 p-0"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFromCartFn(item.id)}
                  className="h-8 w-8 p-0 text-red-500"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-gray-500">
              {activeView === "sales" ? (
                <>
                  <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p className="font-medium">Cart is empty</p>
                  <p className="text-sm">Add products to start a sale</p>
                </>
              ) : (
                <>
                  <RotateCcw className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p className="font-medium">No items to return</p>
                  <p className="text-sm">Select products to process a return</p>
                </>
              )}
            </div>
          )}
        </div>

        {currentCart.length > 0 && (
          <>
            <Separator />
            <div className="space-y-4">
              {activeView === "sales" && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Payment Method</label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax:</span>
                  <span>{formatCurrency(totalTax)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between text-xl font-bold">
                  <span>{activeView === "sales" ? "Total:" : "Return Amount:"}</span>
                  <span>{formatCurrency(totalWithTax)}</span>
                </div>
              </div>

              <Button onClick={processAction} disabled={processing} className="w-full" size="lg">
                {processing ? (
                  "Processing..."
                ) : activeView === "sales" ? (
                  <>
                    <CreditCard className="mr-2 h-5 w-5" />
                    Process Sale
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-5 w-5" />
                    Process Return
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  // Show skeleton while loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b bg-white shadow-sm">
          <div className="flex h-16 items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <Store className="h-8 w-8 text-gray-700" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">POS</h1>
                <p className="text-sm text-gray-600">Staff Dashboard</p>
              </div>
            </div>
            <div className="h-10 w-10 bg-gray-200 animate-pulse rounded-full" />
          </div>
        </header>

        <div className="flex flex-1 h-[calc(100vh-4rem)]">
          {/* Sidebar skeleton */}
          <div className="w-64 bg-white border-r p-4 space-y-3">
            <div className="h-10 bg-gray-200 animate-pulse rounded" />
            <div className="h-10 bg-gray-200 animate-pulse rounded" />
            <div className="h-10 bg-gray-200 animate-pulse rounded" />
          </div>

          {/* Products skeleton */}
          <div className="flex-1 p-6 space-y-4">
            <div className="flex gap-4">
              <div className="h-10 flex-1 bg-gray-200 animate-pulse rounded" />
              <div className="h-10 w-40 bg-gray-200 animate-pulse rounded" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="rounded-lg border bg-white p-4 space-y-3">
                  <div className="h-20 bg-gray-200 animate-pulse rounded" />
                  <div className="h-4 w-3/4 bg-gray-200 animate-pulse rounded" />
                  <div className="h-3 w-1/2 bg-gray-200 animate-pulse rounded" />
                  <div className="h-6 w-1/3 bg-gray-200 animate-pulse rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Cart skeleton */}
          <div className="w-96 border-l bg-white p-4 space-y-4">
            <div className="h-6 w-1/2 bg-gray-200 animate-pulse rounded" />
            <div className="h-12 bg-gray-200 animate-pulse rounded" />
            <div className="h-12 bg-gray-200 animate-pulse rounded" />
            <div className="h-12 bg-gray-200 animate-pulse rounded" />
            <div className="mt-auto pt-4 border-t space-y-2">
              <div className="h-6 w-full bg-gray-200 animate-pulse rounded" />
              <div className="h-10 w-full bg-gray-200 animate-pulse rounded" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white shadow-sm">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Store className="h-8 w-8 text-gray-700" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">POS</h1>
              <p className="text-sm text-gray-600">Staff Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
                    <span className="text-sm font-semibold text-white">{user.full_name?.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="font-medium">{user.full_name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' })
                    router.push('/auth/login')
                  }}
                  className="text-red-600"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex flex-1 h-[calc(100vh-4rem)]">
        <div className="w-64 bg-white border-r overflow-y-auto">
          <div className="p-4">
            <nav className="space-y-2">
              <Button
                variant={activeView === "sales" ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => setActiveView("sales")}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                Sales
              </Button>
              <Button
                variant={activeView === "return" ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => setActiveView("return")}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Return
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => router.push('/staff/inventory/new')}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => router.push('/staff/restock')}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Restock
              </Button>
            </nav>

            {/* Card Reader Section - Show when Stripe is configured */}
            {settings.paymentProvider === 'Stripe' && (
              <div className="mt-6 pt-4 border-t">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Card Reader</div>
                <div className="space-y-2">
                  {isReaderConnected ? (
                    <>
                      <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                        <Wifi className="h-4 w-4 text-green-600" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-green-800 truncate">
                            {connectedReader?.label || connectedReader?.serial_number || 'Connected'}
                          </p>
                          <p className="text-xs text-green-600">
                            {settings.stripe_simulate === 'true' ? 'Simulated' : 'Ready'}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-gray-500"
                        onClick={disconnectReader}
                      >
                        <WifiOff className="mr-2 h-4 w-4" />
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                        <WifiOff className="h-4 w-4 text-gray-400" />
                        <p className="text-sm text-gray-500">Not connected</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => connectReader()}
                        disabled={connectingReader}
                      >
                        {connectingReader ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Wifi className="mr-2 h-4 w-4" />
                            Connect Reader
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">{activeView === "sales" ? renderSalesView() : renderReturnView()}</div>

        <div className="w-96 border-l bg-white overflow-y-auto">{renderCartSidebar()}</div>
      </div>

      {/* Receipt Modal */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sale Complete!</DialogTitle>
          </DialogHeader>
          {lastSale && (
            <Receipt
              sale={lastSale}
              autoPrint={!settings.printerType || settings.printerType === 'BrowserPrint'}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
