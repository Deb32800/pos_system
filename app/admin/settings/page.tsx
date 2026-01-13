"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Printer, Bluetooth, Usb, Wifi, Save, CreditCard, RotateCcw, CheckCircle, XCircle, ScanLine } from "lucide-react"
import { useSettings } from "@/components/settings-provider"
import { toast } from "sonner"
import { isElectron, listSerialPorts, testPrinterConnection, openCashDrawer, printReceipt } from "@/lib/hardware"
import { FactoryResetButton } from "@/components/admin/factory-reset-button"

type SettingsMap = Record<string, string>

export default function SettingsPage() {
  const { refreshSettings } = useSettings()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SettingsMap>({})
  const [savedSettings, setSavedSettings] = useState<SettingsMap>({}) // Track original saved values
  const [serialPorts, setSerialPorts] = useState<Array<{ path: string; manufacturer?: string }>>([])
  const [testingPrinter, setTestingPrinter] = useState(false)
  const [printerStatus, setPrinterStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Confirmation dialog state
  const [showUrlConfirm, setShowUrlConfirm] = useState(false)
  const [pendingProvider, setPendingProvider] = useState<string>('')
  const [pendingUrl, setPendingUrl] = useState<string>('')

  // Check for Electron and hardware support
  const inElectron = typeof window !== 'undefined' && isElectron()

  const hardwareSupport = useMemo(() => ({
    webUSB: typeof navigator !== 'undefined' && 'usb' in navigator,
    webSerial: typeof navigator !== 'undefined' && 'serial' in navigator,
    webBT: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
    networkPrint: true,
    electronHardware: inElectron,
  }), [inElectron])

  // Check if a specific setting has been modified from the saved value
  const isModified = (key: string): boolean => {
    return settings[key] !== savedSettings[key]
  }

  // Check if any settings have been modified
  const hasUnsavedChanges = useMemo(() => {
    return Object.keys(settings).some(key => settings[key] !== savedSettings[key])
  }, [settings, savedSettings])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' })
        const json = await res.json()
        const data = json.data || {}
        setSettings(data)
        setSavedSettings(data) // Store original values
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()

    // Load serial ports if in Electron
    if (inElectron) {
      listSerialPorts().then(setSerialPorts)
    }
  }, [inElectron])

  const update = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const saveAll = async () => {
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: settings }),
      })
      setSavedSettings({ ...settings }) // Update saved values after successful save
      await refreshSettings()
      toast.success('Settings saved successfully')
    } catch (e) {
      console.error(e)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // Hardware connect sample actions (no real device persistence, just diagnostics)
  const requestUSB = async () => {
    if (inElectron) {
      // In Electron, refresh serial ports list
      const ports = await listSerialPorts()
      setSerialPorts(ports)
      if (ports.length > 0) {
        toast.success(`Found ${ports.length} device(s)`)
      } else {
        toast.info('No devices found')
      }
      return
    }
    try {
      // @ts-ignore
      const device = await navigator.usb.requestDevice({ filters: [] })
      alert(`USB selected: ${device.productName || 'Unknown device'}`)
    } catch (e: any) {
      if (e?.name !== 'NotFoundError') console.error(e)
    }
  }

  const requestSerial = async () => {
    if (inElectron) {
      const ports = await listSerialPorts()
      setSerialPorts(ports)
      if (ports.length > 0) {
        toast.success(`Found ${ports.length} serial port(s)`)
      } else {
        toast.info('No serial ports found')
      }
      return
    }
    try {
      // @ts-ignore
      const port = await navigator.serial.requestPort()
      alert('Serial port selected')
    } catch (e: any) {
      if (e?.name !== 'NotFoundError') console.error(e)
    }
  }

  const requestBT = async () => {
    try {
      // @ts-ignore
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true })
      alert(`Bluetooth selected: ${device.name || 'Unknown device'}`)
    } catch (e: any) {
      if (e?.name !== 'NotFoundError') console.error(e)
    }
  }

  const handleTestPrinter = async () => {
    setTestingPrinter(true)
    setPrinterStatus('idle')
    try {
      const result = await testPrinterConnection(settings)
      if (result.success) {
        setPrinterStatus('success')
        toast.success('Printer connection successful!')
      } else {
        setPrinterStatus('error')
        toast.error(result.error || 'Printer connection failed')
      }
    } catch (err: any) {
      setPrinterStatus('error')
      toast.error(err.message || 'Printer test failed')
    } finally {
      setTestingPrinter(false)
    }
  }

  const handleOpenCashDrawer = async () => {
    try {
      const result = await openCashDrawer(settings)
      if (result.success) {
        toast.success('Cash drawer opened!')
      } else {
        toast.error(result.error || 'Failed to open cash drawer')
      }
    } catch (err: any) {
      toast.error(err.message || 'Cash drawer error')
    }
  }

  const handlePrintTestReceipt = async () => {
    // Create a sample test receipt
    const testSale = {
      saleNumber: 'TEST-001',
      createdAt: new Date().toISOString(),
      saleItems: [
        { product: { name: 'Test Product 1' }, quantity: 2, unitPrice: 100, totalPrice: 200 },
        { product: { name: 'Test Product 2' }, quantity: 1, unitPrice: 350, totalPrice: 350 },
      ],
      subtotal: 550,
      taxAmount: 55,
      totalAmount: 605,
      paymentMethod: 'CASH',
      cashier: { fullName: 'Test Cashier' },
    }

    const printerType = settings.printerType || 'BrowserPrint'

    if (printerType === 'BrowserPrint') {
      // For browser print, we'll open a print window with the test receipt
      const receiptContent = `
        <html>
        <head>
          <title>Test Receipt</title>
          <style>
            body { font-family: monospace; width: ${settings.receiptWidth === '58mm' ? '48mm' : '72mm'}; margin: 0 auto; padding: 10px; font-size: 12px; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .line { border-top: 1px dashed #000; margin: 8px 0; }
            table { width: 100%; }
            td:last-child { text-align: right; }
            .header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 15px; }
            .logo { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
            .header-text { flex: 1; }
            .close-btn { position: fixed; top: 10px; right: 10px; padding: 8px 16px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; }
            @media print { .close-btn { display: none; } }
          </style>
        </head>
        <body>
          <button class="close-btn" onclick="window.close()">Close</button>
          <div class="header">
            ${settings.receipt_logo ? `<img src="${settings.receipt_logo}" class="logo" onerror="this.style.display='none'" />` : ''}
            <div class="header-text">
              <div class="bold">${settings.receipt_header || settings.store_name || 'YOUR STORE'}</div>
              <div style="font-size:10px">${settings.store_address || ''}</div>
              <div style="font-size:10px">${settings.store_phone || ''}</div>
            </div>
          </div>
          <div class="line"></div>
          <div class="center bold">*** TEST RECEIPT ***</div>
          <div class="line"></div>
          <div>Date: ${new Date().toLocaleString()}</div>
          <div>Receipt #: TEST-001</div>
          <div class="line"></div>
          <table>
            <tr><td>Test Product 1 x2</td><td>¥200</td></tr>
            <tr><td>Test Product 2 x1</td><td>¥350</td></tr>
          </table>
          <div class="line"></div>
          <table>
            <tr><td>Subtotal:</td><td>¥550</td></tr>
            <tr><td>Tax:</td><td>¥55</td></tr>
            <tr class="bold"><td>TOTAL:</td><td>¥605</td></tr>
          </table>
          <div class="line"></div>
          <div class="center">${settings.receipt_footer || 'Thank you for your purchase!'}</div>
        </body>
        </html>
      `
      const printWindow = window.open('', '_blank', 'width=400,height=600')
      if (printWindow) {
        printWindow.document.write(receiptContent)
        printWindow.document.close()
        printWindow.focus()
        // Don't auto-close, let user see the receipt and print manually
      }
      toast.success('Test receipt opened - click Print in the popup or use Ctrl+P')
    } else {
      // For ESC/POS printers, use the hardware print function
      const result = await printReceipt(testSale, settings)
      if (result.success) {
        toast.success('Test receipt printed!')
      } else {
        toast.error(result.error || 'Failed to print test receipt')
      }
    }
  }

  // Helper for input styling - grey when saved, black when modified
  const getInputStyle = (key: string) =>
    isModified(key) ? 'text-foreground font-medium' : 'text-muted-foreground'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Configure company, receipts, and hardware.</p>
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <span className="text-sm text-orange-500 font-medium">Unsaved changes</span>
          )}
          <Button onClick={saveAll} disabled={saving || !hasUnsavedChanges}>
            <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving...' : 'Save All'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="hardware">Hardware</TabsTrigger>
          <TabsTrigger value="api">API Integration</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="store_name">Store Name</Label>
                  <Input id="store_name" className={getInputStyle('store_name')} value={settings.store_name || ''} onChange={(e) => update('store_name', e.target.value)} placeholder="Purrfect Cat Shop" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="store_phone">Store Phone</Label>
                  <Input id="store_phone" className={getInputStyle('store_phone')} value={settings.store_phone || ''} onChange={(e) => update('store_phone', e.target.value)} placeholder="+852 1234 5678" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="store_email">Store Email</Label>
                  <Input id="store_email" className={getInputStyle('store_email')} value={settings.store_email || ''} onChange={(e) => update('store_email', e.target.value)} placeholder="hello@catshop.hk" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="store_address">Store Address</Label>
                  <Input id="store_address" className={getInputStyle('store_address')} value={settings.store_address || ''} onChange={(e) => update('store_address', e.target.value)} placeholder="123 Cat Street, Hong Kong" />
                </div>

                <Separator className="md:col-span-2" />


                <div className="space-y-2">
                  <Label htmlFor="default_tax_percent">Default Tax Percentage (%)</Label>
                  <Input
                    id="default_tax_percent"
                    type="number"
                    className={getInputStyle('default_tax_percent')}
                    value={settings.default_tax_percent || ''}
                    onChange={(e) => update('default_tax_percent', e.target.value)}
                    placeholder="e.g. 10"
                  />
                </div>
              </div>

              <Separator className="my-6" />

              <h3 className="text-lg font-medium">Receipt Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="receipt_header">Receipt Header</Label>
                  <Input id="receipt_header" className={getInputStyle('receipt_header')} value={settings.receipt_header || ''} onChange={(e) => update('receipt_header', e.target.value)} placeholder="Store Name / Info" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receipt_footer">Receipt Footer</Label>
                  <Input id="receipt_footer" value={settings.receipt_footer || ''} onChange={(e) => update('receipt_footer', e.target.value)} placeholder="Thank you message" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receiptWidth">Paper Width</Label>
                  <Select value={settings.receiptWidth || '80mm'} onValueChange={(v) => update('receiptWidth', v)}>
                    <SelectTrigger id="receiptWidth">
                      <SelectValue placeholder="Select width" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58mm">58mm (Small Thermal)</SelectItem>
                      <SelectItem value="80mm">80mm (Standard Thermal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Store Logo (Optional)</Label>
                  <div className="flex items-center gap-4">
                    {/* Circular preview */}
                    <div className="relative">
                      {settings.receipt_logo ? (
                        <img
                          src={settings.receipt_logo}
                          alt="Store Logo"
                          className="w-16 h-16 rounded-full object-cover border-2 border-muted"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs">
                          No Logo
                        </div>
                      )}
                    </div>
                    {/* Upload controls */}
                    <div className="flex flex-col gap-2">
                      <input
                        type="file"
                        id="logo-upload"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            const reader = new FileReader()
                            reader.onload = (event) => {
                              // Create image to resize/crop
                              const img = new Image()
                              img.onload = () => {
                                const canvas = document.createElement('canvas')
                                const size = 200 // Output size
                                canvas.width = size
                                canvas.height = size
                                const ctx = canvas.getContext('2d')
                                if (ctx) {
                                  // Crop to square (center crop)
                                  const minSize = Math.min(img.width, img.height)
                                  const sx = (img.width - minSize) / 2
                                  const sy = (img.height - minSize) / 2
                                  ctx.drawImage(img, sx, sy, minSize, minSize, 0, 0, size, size)
                                  // Convert to base64
                                  const base64 = canvas.toDataURL('image/png', 0.8)
                                  update('receipt_logo', base64)
                                }
                              }
                              img.src = event.target?.result as string
                            }
                            reader.readAsDataURL(file)
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('logo-upload')?.click()}
                      >
                        Upload Logo
                      </Button>
                      {settings.receipt_logo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-500"
                          onClick={() => update('receipt_logo', '')}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Image will be cropped to a circle (200×200px)</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <div className="text-sm text-muted-foreground">Preview uses header/footer above in your print template.</div>
                <Button variant="outline" onClick={handlePrintTestReceipt}><Printer className="mr-2 h-4 w-4" />Print Test Receipt</Button>
              </div>

              {/* Factory Reset Section - Only in Electron */}
              {inElectron && (
                <>
                  <Separator className="my-6" />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-red-600">Danger Zone</h3>
                        <p className="text-sm text-muted-foreground">
                          Factory reset will delete all data and restore default settings.
                        </p>
                      </div>
                      <FactoryResetButton />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hardware">
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Hardware Configuration</h3>
                <Button variant="outline" onClick={requestUSB}>
                  <Usb className="mr-2 h-4 w-4" /> {inElectron ? 'Scan for Devices' : 'Detect Devices'}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Printer Section */}
                <div className="space-y-4 border p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Printer className="h-5 w-5" />
                      <h4 className="font-medium">Receipt Printer</h4>
                    </div>
                    {printerStatus === 'success' && <CheckCircle className="h-5 w-5 text-green-600" />}
                    {printerStatus === 'error' && <XCircle className="h-5 w-5 text-red-600" />}
                  </div>

                  <div className="space-y-2">
                    <Label>Connection Type</Label>
                    <Select value={settings.printerType || 'Auto'} onValueChange={(v) => update('printerType', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select printer type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Auto">Auto-Detect</SelectItem>
                        <SelectItem value="BrowserPrint">Browser Print</SelectItem>
                        <SelectItem value="Network">Network / LAN (IP)</SelectItem>
                        <SelectItem value="USB">USB Direct</SelectItem>
                        <SelectItem value="Serial">Serial Port</SelectItem>
                      </SelectContent>
                    </Select>
                    {!inElectron && (settings.printerType === 'USB' || settings.printerType === 'Serial') && (
                      <p className="text-xs text-amber-600">USB/Serial printing requires running as Electron app</p>
                    )}
                  </div>

                  {settings.printerType === 'Network' && (
                    <div className="space-y-2">
                      <Label htmlFor="printerIp">Printer IP Address</Label>
                      <Input id="printerIp" value={settings.printerIp || ''} onChange={(e) => update('printerIp', e.target.value)} placeholder="192.168.1.100" />
                      <Label htmlFor="printerPort">Port</Label>
                      <Input id="printerPort" value={settings.printerPort || '9100'} onChange={(e) => update('printerPort', e.target.value)} placeholder="9100" />
                    </div>
                  )}

                  {(settings.printerType === 'USB' || settings.printerType === 'Serial') && (
                    <div className="space-y-2">
                      <Label>Port / Device</Label>
                      {inElectron && serialPorts.length > 0 ? (
                        <Select value={settings.printerPortName || ''} onValueChange={(v) => update('printerPortName', v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select port" />
                          </SelectTrigger>
                          <SelectContent>
                            {serialPorts.map((port) => (
                              <SelectItem key={port.path} value={port.path}>
                                {port.path} {port.manufacturer ? `(${port.manufacturer})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex gap-2">
                          <Input value={settings.printerPortName || ''} onChange={(e) => update('printerPortName', e.target.value)} placeholder="e.g. /dev/ttyUSB0 or COM3" />
                          {inElectron && (
                            <Button size="icon" variant="ghost" onClick={requestSerial}>
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Windows: COM1, COM2, etc. | Mac/Linux: /dev/ttyUSB0, /dev/tty.usbserial, etc.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={handleTestPrinter} disabled={testingPrinter}>
                      {testingPrinter ? 'Testing...' : 'Test Connection'}
                    </Button>
                  </div>
                </div>

                {/* Barcode Scanner - Works automatically via keyboard emulation */}
                <div className="space-y-4 border p-4 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <ScanLine className="h-5 w-5" />
                    <h4 className="font-medium">Barcode Scanner</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    USB barcode scanners work automatically — just plug in and scan!
                    No configuration needed. Scanners operate in keyboard mode and type barcodes directly into the app.
                  </p>
                </div>
              </div>

              <Separator />

              <h3 className="text-lg font-medium">Payment Terminal</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Terminal Provider</Label>
                  <Select value={settings.paymentProvider || 'None'} onValueChange={(v) => update('paymentProvider', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="None">None (Manual Card Entry)</SelectItem>
                      <SelectItem value="Stripe">Stripe Terminal</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Stripe Terminal allows integrated card payments via WiFi-connected readers.
                  </p>
                </div>

                {settings.paymentProvider === 'Stripe' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="stripe_pk">Publishable Key</Label>
                      <Input
                        id="stripe_pk"
                        type="password"
                        value={settings.stripe_pk || ''}
                        onChange={(e) => update('stripe_pk', e.target.value)}
                        placeholder="pk_test_... or pk_live_..."
                        className={getInputStyle('stripe_pk')}
                      />
                      <p className="text-xs text-muted-foreground">
                        From Stripe Dashboard → Developers → API Keys
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stripe_sk">Secret Key</Label>
                      <Input
                        id="stripe_sk"
                        type="password"
                        value={settings.stripe_sk || ''}
                        onChange={(e) => update('stripe_sk', e.target.value)}
                        placeholder="sk_test_... or sk_live_..."
                        className={getInputStyle('stripe_sk')}
                      />
                      <p className="text-xs text-muted-foreground">
                        Keep this secret! Never share publicly.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stripe_location">Location ID (Optional)</Label>
                      <Input
                        id="stripe_location"
                        value={settings.stripe_location || ''}
                        onChange={(e) => update('stripe_location', e.target.value)}
                        placeholder="tml_..."
                        className={getInputStyle('stripe_location')}
                      />
                      <p className="text-xs text-muted-foreground">
                        For multi-location setups. Leave blank for single location.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="stripe_simulate"
                          checked={settings.stripe_simulate === 'true'}
                          onChange={(e) => update('stripe_simulate', e.target.checked ? 'true' : 'false')}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <Label htmlFor="stripe_simulate" className="cursor-pointer">
                          Test Mode (Use Simulated Reader)
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Enable to test card payments without a physical reader. Uses test keys (pk_test_, sk_test_).
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium">External Product API</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure an external API to fetch product details when scanning barcodes not found in the local inventory.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Service Provider</Label>
                    <Select
                      value={settings.serviceProvider || 'custom'}
                      onValueChange={(val) => {
                        const presets: Record<string, string> = {
                          openfoodfacts: 'https://world.openfoodfacts.org/api/v0/product/{barcode}.json',
                          upcitemdb: 'https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}',
                          barcodelookup: 'https://api.barcodelookup.com/v3/products?barcode={barcode}&formatted=y&key={key}',
                          goupc: 'https://go-upc.com/api/v1/code/{barcode}'
                        }

                        const newUrl = presets[val]

                        if (newUrl) {
                          // If switching to OpenFoodFacts, always set it (it's locked anyway)
                          if (val === 'openfoodfacts') {
                            update('externalApiUrl', newUrl)
                            update('serviceProvider', val)
                          } else {
                            // Check if we should ask for confirmation
                            if (settings.externalApiUrl && settings.externalApiUrl !== newUrl) {
                              setPendingProvider(val)
                              setPendingUrl(newUrl)
                              setShowUrlConfirm(true)
                            } else {
                              update('externalApiUrl', newUrl)
                              update('serviceProvider', val)
                            }
                          }
                        } else {
                          update('serviceProvider', val)
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a preset..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openfoodfacts">OpenFacts (Food, Pet, Beauty - Free)</SelectItem>
                        <SelectItem value="upcitemdb">UPCitemdb (Free Trial)</SelectItem>
                        <SelectItem value="barcodelookup">Barcode Lookup (Paid)</SelectItem>
                        <SelectItem value="goupc">Go-UPC (Paid)</SelectItem>
                        <SelectItem value="custom">Custom URL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="externalApiUrl">API URL Endpoint</Label>
                    <div className="flex space-x-2">
                      <Input
                        id="externalApiUrl"
                        value={settings.externalApiUrl || ''}
                        onChange={(e) => update('externalApiUrl', e.target.value)}
                        placeholder="https://api.example.com/products/{barcode}"
                        disabled={settings.serviceProvider === 'openfoodfacts'}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        title="Reset to Default"
                        onClick={() => {
                          const presets: Record<string, string> = {
                            openfoodfacts: 'https://world.openfoodfacts.org/api/v0/product/{barcode}.json',
                            upcitemdb: 'https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}',
                            barcodelookup: 'https://api.barcodelookup.com/v3/products?barcode={barcode}&formatted=y&key={key}',
                            goupc: 'https://go-upc.com/api/v1/code/{barcode}'
                          }
                          const defaultUrl = presets[settings.serviceProvider || '']
                          if (defaultUrl) {
                            update('externalApiUrl', defaultUrl)
                          }
                        }}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="externalApiKey">API Key (Optional)</Label>
                    <Input
                      id="externalApiKey"
                      type="password"
                      value={settings.externalApiKey || ''}
                      onChange={(e) => update('externalApiKey', e.target.value)}
                      placeholder="e.g. Bearer token or API Key"
                    />
                    <p className="text-xs text-muted-foreground">
                      If the API requires authentication, enter the key here. It will be sent in the headers.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


      </Tabs>

      <Dialog open={showUrlConfirm} onOpenChange={setShowUrlConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update API URL?</DialogTitle>
            <DialogDescription>
              Do you want to update the API URL to the provider's default?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              // Cancel: Don't change provider, don't change URL. Keep it as is.
              setShowUrlConfirm(false)
              setPendingProvider('')
              setPendingUrl('')
            }}>
              No, Keep Current
            </Button>
            <Button onClick={() => {
              // Yes: Update both provider and URL
              update('externalApiUrl', pendingUrl)
              update('serviceProvider', pendingProvider)
              setShowUrlConfirm(false)
            }}>
              Yes, Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


