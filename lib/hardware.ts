/**
 * Hardware utility functions for POS
 * Works in both browser (limited) and Electron (full support)
 */

// Check if running in Electron
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && !!window.electronAPI?.isElectron
}

// Print receipt via network printer (ESC/POS)
export async function printReceiptNetwork(
  ip: string,
  port: string,
  saleData: any,
  settings: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  if (!isElectron()) {
    // Fallback: use browser print
    window.print()
    return { success: true }
  }

  try {
    // Generate ESC/POS commands
    const result = await window.electronAPI!.escpos.generateReceipt(saleData, settings)
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Failed to generate receipt' }
    }

    // Send to printer
    const printResult = await window.electronAPI!.printer.printNetwork(ip, port, result.data)
    return printResult
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// Print receipt via USB/Serial printer
export async function printReceiptSerial(
  portPath: string,
  saleData: any,
  settings: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  if (!isElectron()) {
    return { success: false, error: 'USB/Serial printing requires Electron app' }
  }

  try {
    // Generate ESC/POS commands
    const result = await window.electronAPI!.escpos.generateReceipt(saleData, settings)
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Failed to generate receipt' }
    }

    // Open port if not already open
    const openResult = await window.electronAPI!.serial.open(portPath, 9600, false)
    if (!openResult.success) {
      // Port might already be open, try writing anyway
      console.warn('Port open warning:', openResult.error)
    }

    // Send to printer
    const printResult = await window.electronAPI!.serial.write(portPath, result.data)
    return printResult
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// Print receipt (auto-detect method)
export async function printReceipt(
  saleData: any,
  settings: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  let printerType = settings.printerType || 'Auto'

  // Auto-detect: choose the best available option
  if (printerType === 'Auto') {
    if (isElectron()) {
      // In Electron: prefer USB/Serial if configured, else Network, else Browser
      if (settings.printerSerialPort || settings.printerPortName) {
        printerType = 'Serial'
      } else if (settings.printerIp) {
        printerType = 'Network'
      } else {
        printerType = 'BrowserPrint'
      }
    } else {
      // In browser: prefer Network if configured, else Browser
      if (settings.printerIp) {
        printerType = 'Network'
      } else {
        printerType = 'BrowserPrint'
      }
    }
  }

  switch (printerType) {
    case 'Network':
      const ip = settings.printerIp
      const port = settings.printerPort || '9100'
      if (!ip) {
        return { success: false, error: 'Printer IP not configured' }
      }
      return printReceiptNetwork(ip, port, saleData, settings)

    case 'USB':
    case 'Serial':
      if (!isElectron()) {
        return { success: false, error: 'USB/Serial printing requires Electron app' }
      }
      const serialPort = settings.printerSerialPort || settings.printerPortName
      if (!serialPort) {
        return { success: false, error: 'Printer serial port not configured' }
      }
      return printReceiptSerial(serialPort, saleData, settings)

    case 'BrowserPrint':
    default:
      // Trigger browser print dialog
      window.print()
      return { success: true }
  }
}

// Open cash drawer
export async function openCashDrawer(
  settings: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const printerType = settings.printerType || 'BrowserPrint'

  if (printerType === 'Network' && settings.printerIp) {
    if (!isElectron()) {
      return { success: false, error: 'Cash drawer requires Electron app' }
    }
    try {
      return await window.electronAPI!.cashDrawer.kick(
        settings.printerIp,
        settings.printerPort || '9100'
      )
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  return { success: false, error: 'Cash drawer not configured' }
}

// List available serial ports (for scanner/printer setup)
export async function listSerialPorts(): Promise<Array<{ path: string; manufacturer?: string }>> {
  if (!isElectron()) {
    return []
  }
  try {
    return await window.electronAPI!.serial.listPorts()
  } catch {
    return []
  }
}

// Test printer connection
export async function testPrinterConnection(
  settings: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const printerType = settings.printerType || 'BrowserPrint'

  if (printerType === 'Network' && settings.printerIp) {
    if (!isElectron()) {
      return { success: false, error: 'Network printer test requires Electron app' }
    }

    // Send a simple test (just initialize command)
    const testData = [0x1B, 0x40] // ESC @ - Initialize printer
    try {
      return await window.electronAPI!.printer.printNetwork(
        settings.printerIp,
        settings.printerPort || '9100',
        testData
      )
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  if (printerType === 'BrowserPrint') {
    return { success: true } // Browser print is always "available"
  }

  return { success: false, error: 'Printer not configured' }
}
