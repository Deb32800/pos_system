// Type definitions for Electron API exposed via preload.js

export interface ElectronAPI {
  printer: {
    printNetwork: (ip: string, port: string, data: number[]) => Promise<{ success: boolean; error?: string }>
    printSerial: (portPath: string, data: number[]) => Promise<{ success: boolean; error?: string }>
  }
  serial: {
    listPorts: () => Promise<Array<{ path: string; manufacturer?: string; productId?: string }>>
    open: (portPath: string, baudRate?: number, isScanner?: boolean) => Promise<{ success: boolean; path?: string; error?: string }>
    write: (portPath: string, data: number[]) => Promise<{ success: boolean; error?: string }>
    close: (portPath: string) => Promise<{ success: boolean; error?: string }>
  }
  scanner: {
    connect: (portPath: string, baudRate?: number) => Promise<{ success: boolean; path?: string; error?: string }>
    onData: (callback: (barcode: string) => void) => void
    removeListener: () => void
    disconnect: (portPath: string) => Promise<{ success: boolean; error?: string }>
  }
  escpos: {
    generateReceipt: (saleData: any, settings: Record<string, string>) => Promise<{ success: boolean; data?: number[]; error?: string }>
  }
  cashDrawer: {
    kick: (ip: string, port: string) => Promise<{ success: boolean; error?: string }>
  }
  app: {
    factoryReset: () => Promise<{ success: boolean; error?: string }>
    getUserDataPath: () => Promise<string>
    getInfo: () => Promise<{
      version: string
      platform: string
      arch: string
      userDataPath: string
      isPackaged: boolean
      port: number
    }>
  }
  platform: string
  isElectron: boolean
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export { }
