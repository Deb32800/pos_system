const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process
// to use the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Printer operations
  printer: {
    printNetwork: (ip, port, data) => 
      ipcRenderer.invoke('printer:print-network', { ip, port, data }),
    printSerial: (portPath, data) =>
      ipcRenderer.invoke('serial:write', { path: portPath, data }),
  },
  
  // Serial port operations
  serial: {
    listPorts: () => ipcRenderer.invoke('serial:list-ports'),
    open: (portPath, baudRate, isScanner = false) => 
      ipcRenderer.invoke('serial:open', { path: portPath, baudRate, isScanner }),
    write: (portPath, data) => ipcRenderer.invoke('serial:write', { path: portPath, data }),
    close: (portPath) => ipcRenderer.invoke('serial:close', { path: portPath }),
  },
  
  // Scanner operations
  scanner: {
    // Open scanner port and start listening
    connect: (portPath, baudRate = 9600) => 
      ipcRenderer.invoke('serial:open', { path: portPath, baudRate, isScanner: true }),
    // Listen for barcode data from scanner (main.js emits 'serial:data')
    onData: (callback) => {
      ipcRenderer.on('serial:data', (event, { port, data }) => callback(data))
    },
    // Remove listener
    removeListener: () => {
      ipcRenderer.removeAllListeners('serial:data')
    },
    disconnect: (portPath) => ipcRenderer.invoke('serial:close', { path: portPath }),
  },
  
  // ESC/POS operations
  escpos: {
    generateReceipt: (saleData, settings) => 
      ipcRenderer.invoke('escpos:generate-receipt', { saleData, settings }),
  },
  
  // Cash drawer
  cashDrawer: {
    kick: (ip, port) => ipcRenderer.invoke('cashdrawer:kick', { ip, port }),
  },
  
  // Platform info
  platform: process.platform,
  isElectron: true,
})
