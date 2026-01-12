/**
 * POS System - Electron Main Process
 * Production-ready with automatic port management and proper database initialization
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { fork, execSync, spawn } = require('child_process')
const net = require('net')
const http = require('http')
const fs = require('fs')
const crypto = require('crypto')

// ============================================
// CONFIGURATION
// ============================================

const APP_NAME = 'POS System'
const DEFAULT_PORT = 3456
const PORT_RANGE = [3456, 3457, 3458, 3459, 3460, 3500, 3501, 3600, 4000, 4001, 4002, 8080, 8081]
const MAX_SERVER_WAIT_ATTEMPTS = 120 // 2 minutes

// Hardware modules - lazy loaded
let SerialPort = null

// Global references
let mainWindow = null
let nextProcess = null
let currentPort = DEFAULT_PORT
const openPorts = new Map()

// Development vs Production
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ============================================
// PATH UTILITIES
// ============================================

/**
 * Get the user data directory for storing persistent data
 * macOS: ~/Library/Application Support/POS System/
 * Windows: C:\Users\<user>\AppData\Roaming\POS System\
 * Linux: ~/.config/POS System/
 */
const getUserDataPath = () => {
  return app.getPath('userData')
}

/**
 * Get database path - stored in user data directory
 */
const getDbPath = () => {
  if (isDev) {
    return path.join(__dirname, '..', 'prisma', 'pos.db')
  }
  return path.join(getUserDataPath(), 'data', 'pos.db')
}

/**
 * Get uploads directory path
 */
const getUploadsPath = () => {
  if (isDev) {
    return path.join(__dirname, '..', 'public', 'uploads')
  }
  return path.join(getUserDataPath(), 'uploads')
}

/**
 * Get logs directory path
 */
const getLogsPath = () => {
  return path.join(getUserDataPath(), 'logs')
}

// ============================================
// PORT MANAGEMENT
// ============================================

/**
 * Check if a port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port, '127.0.0.1')
  })
}

/**
 * Find an available port from the list
 */
async function findAvailablePort() {
  for (const port of PORT_RANGE) {
    console.log(`Checking port ${port}...`)
    const available = await isPortAvailable(port)
    if (available) {
      console.log(`Found available port: ${port}`)
      return port
    }
    console.log(`Port ${port} is in use`)
  }
  throw new Error(`No available ports found. Tried: ${PORT_RANGE.join(', ')}`)
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Create necessary directories
 */
const ensureDirectories = () => {
  const dirs = [
    path.dirname(getDbPath()),
    getUploadsPath(),
    getLogsPath(),
  ]

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      console.log(`Created directory: ${dir}`)
    }
  }
}

/**
 * Generate a secure JWT secret
 */
const generateJwtSecret = () => {
  const secretPath = path.join(getUserDataPath(), '.jwt-secret')

  // Check if secret already exists
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf-8').trim()
  }

  // Generate new secret
  const secret = crypto.randomBytes(64).toString('hex')
  fs.writeFileSync(secretPath, secret)
  return secret
}

/**
 * Initialize database with proper schema
 */
const initializeDatabase = async () => {
  if (isDev) return // In dev mode, use existing database

  const targetDb = getDbPath()
  const dataDir = path.dirname(targetDb)

  console.log('=== Database Initialization ===')
  console.log('User data path:', getUserDataPath())
  console.log('Target database:', targetDb)

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  // Check if database already exists and has tables
  if (fs.existsSync(targetDb)) {
    const stats = fs.statSync(targetDb)
    if (stats.size > 0) {
      console.log('Database already exists with data, using existing')
      return
    }
  }

  // Look for seed database in resources
  const seedDb = path.join(process.resourcesPath, 'prisma', 'pos.db')
  console.log('Looking for seed database at:', seedDb)

  if (fs.existsSync(seedDb)) {
    const seedStats = fs.statSync(seedDb)
    if (seedStats.size > 0) {
      fs.copyFileSync(seedDb, targetDb)
      console.log('Database initialized from seed')
      return
    }
  }

  // No seed database - create fresh database with schema
  console.log('No seed database found - creating fresh database with schema')

  // Create SQLite database with schema directly
  try {
    await createFreshDatabase(targetDb)
    console.log('Fresh database created successfully')
  } catch (err) {
    console.error('Failed to create database:', err)
    throw err
  }
}

/**
 * Create a fresh SQLite database with the schema
 */
async function createFreshDatabase(dbPath) {
  // Import better-sqlite3 for direct database creation
  let Database
  try {
    Database = require('better-sqlite3')
  } catch (e) {
    // Fallback: just create empty file, Prisma will handle it
    console.log('better-sqlite3 not available, creating empty database file')
    fs.writeFileSync(dbPath, '')
    return
  }

  const db = new Database(dbPath)

  // Create all tables based on Prisma schema
  db.exec(`
    -- Categories table
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Products table
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      sku TEXT UNIQUE NOT NULL,
      barcode TEXT UNIQUE,
      costPrice REAL NOT NULL,
      sellingPrice REAL NOT NULL,
      taxPercent REAL DEFAULT 0,
      stockQuantity INTEGER DEFAULT 0,
      minStockLevel INTEGER DEFAULT 0,
      maxStockLevel INTEGER DEFAULT 1000,
      isActive INTEGER DEFAULT 1,
      categoryId TEXT NOT NULL,
      imagePath TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (categoryId) REFERENCES categories(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_products_categoryId ON products(categoryId);
    CREATE INDEX IF NOT EXISTS idx_products_stockQuantity ON products(stockQuantity);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    
    -- Sales table
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      saleNumber TEXT UNIQUE NOT NULL,
      totalAmount REAL NOT NULL,
      subtotal REAL NOT NULL,
      taxAmount REAL DEFAULT 0,
      discountAmount REAL DEFAULT 0,
      paymentMethod TEXT DEFAULT 'CASH',
      status TEXT DEFAULT 'COMPLETED',
      notes TEXT,
      cashierId TEXT NOT NULL,
      stripePaymentIntentId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Sale items table
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      saleId TEXT NOT NULL,
      productId TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unitPrice REAL NOT NULL,
      totalPrice REAL NOT NULL,
      discount REAL DEFAULT 0,
      FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id)
    );
    
    -- Stock movements table
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reference TEXT,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (productId) REFERENCES products(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_stock_movements ON stock_movements(productId, createdAt);
    
    -- Settings table
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      fullName TEXT NOT NULL,
      role TEXT DEFAULT 'STAFF',
      isActive INTEGER DEFAULT 1,
      mustChangePassword INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      lastLoginAt TEXT,
      lastLogoutAt TEXT
    );
    
    -- Prisma migrations table (to track that we've set up the schema)
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      finished_at TEXT,
      migration_name TEXT NOT NULL,
      logs TEXT,
      rolled_back_at TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      applied_steps_count INTEGER DEFAULT 0
    );
    
    -- Insert migration record
    INSERT OR IGNORE INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count)
    VALUES ('electron_init', 'electron_init_checksum', 'electron_initial_setup', datetime('now'), 1);
    
    -- Insert default settings
    INSERT OR IGNORE INTO settings (id, key, value, description) VALUES
      ('set_1', 'store_name', 'Cat Shop POS', 'Store display name'),
      ('set_2', 'currency', 'JPY', 'Currency code'),
      ('set_3', 'currency_symbol', '¥', 'Currency symbol'),
      ('set_4', 'tax_rate', '10', 'Default tax rate'),
      ('set_5', 'receipt_footer', 'Thank you for shopping with us!', 'Receipt footer message');
    
    -- Insert default admin user (password: admin123, bcrypt hash with 10 rounds)
    -- User must change password on first login
    INSERT OR IGNORE INTO users (id, username, passwordHash, fullName, role, isActive, mustChangePassword)
    VALUES (
      'admin_default',
      'admin',
      '$2b$10$2Rxzi277FjQ64zuohKQ4eOsDRUH09Pi5iXrgk.SFtRLsnahhG6m/S',
      'Administrator',
      'ADMIN',
      1,
      1
    );
  `)

  db.close()
  console.log('Database schema created successfully')
}

/**
 * Setup environment variables
 */
const setupEnvironment = () => {
  const dbPath = getDbPath()

  // Set database URL
  process.env.DATABASE_URL = `file:${dbPath}`

  // Set Node environment
  process.env.NODE_ENV = isDev ? 'development' : 'production'

  // Set JWT secret (persistent across restarts)
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = generateJwtSecret()
  }

  // Set uploads path for the server
  process.env.UPLOADS_PATH = getUploadsPath()

  console.log('=== Environment Setup ===')
  console.log('DATABASE_URL:', process.env.DATABASE_URL)
  console.log('NODE_ENV:', process.env.NODE_ENV)
  console.log('UPLOADS_PATH:', process.env.UPLOADS_PATH)
}

// ============================================
// WINDOW MANAGEMENT
// ============================================

/**
 * Create the main application window
 */
async function createWindow() {
  // Initialize
  ensureDirectories()
  setupEnvironment()

  try {
    await initializeDatabase()
  } catch (err) {
    console.error('Database initialization failed:', err)
  }

  // Create browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: getIconPath(),
    title: APP_NAME,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#ffffff',
  })

  // Show loading screen
  await showLoadingScreen()
  mainWindow.show()

  // Configure window opening behavior (for printing windows, etc.)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // If it's a blob/internal URL (like printing), allow it
    if (url.startsWith('blob:') || url.startsWith('about:blank') || url.startsWith('data:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          }
        }
      }
    }

    // For external URLs, open in default browser
    if (url.startsWith('http:') || url.startsWith('https:')) {
      require('electron').shell.openExternal(url)
      return { action: 'deny' }
    }

    return { action: 'allow' }
  })

  // Clear session on startup to force login
  try {
    const ses = mainWindow.webContents.session
    await ses.clearStorageData({
      storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'cachestorage']
    })
    console.log('Session cleared on startup - login required')
  } catch (err) {
    console.error('Failed to clear session on startup:', err)
  }

  try {
    if (isDev) {
      // Development: connect to Next.js dev server
      await waitForServer(3000)
      mainWindow.loadURL('http://localhost:3000')
      mainWindow.webContents.openDevTools()
    } else {
      // Production: find available port and start server
      currentPort = await findAvailablePort()
      console.log(`Using port: ${currentPort}`)

      await startNextServer(currentPort)
      await waitForServer(currentPort)

      const url = `http://localhost:${currentPort}`
      console.log('Server ready, loading:', url)
      mainWindow.loadURL(url)
    }
  } catch (err) {
    console.error('Failed to start application:', err)
    await showErrorScreen(err.message)
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Handle navigation errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription)
    if (errorCode !== -3) { // Ignore aborted loads
      showErrorScreen(`Failed to load page: ${errorDescription}`)
    }
  })
}

/**
 * Get the appropriate icon path based on platform
 */
const getIconPath = () => {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  if (isDev) {
    return path.join(__dirname, '..', 'public', iconName)
  }
  return path.join(process.resourcesPath, 'app', 'public', iconName)
}

/**
 * Show loading screen while server starts
 */
const showLoadingScreen = () => {
  return mainWindow.loadURL(`data:text/html;charset=utf-8,
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${APP_NAME}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .loader {
            text-align: center;
            padding: 40px;
          }
          .spinner {
            width: 60px;
            height: 60px;
            border: 4px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 1s ease-in-out infinite;
            margin: 0 auto 24px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          h1 { font-size: 28px; margin-bottom: 8px; font-weight: 600; }
          p { font-size: 16px; opacity: 0.9; }
          .version { font-size: 12px; opacity: 0.6; margin-top: 24px; }
        </style>
      </head>
      <body>
        <div class="loader">
          <div class="spinner"></div>
          <h1>${APP_NAME}</h1>
          <p>Starting application...</p>
          <p class="version">v${app.getVersion()}</p>
        </div>
      </body>
    </html>
  `)
}

/**
 * Show error screen if startup fails
 */
const showErrorScreen = (errorMessage) => {
  return mainWindow.loadURL(`data:text/html;charset=utf-8,
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Error - ${APP_NAME}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background: #1a1a2e;
            color: white;
          }
          .error {
            text-align: center;
            padding: 40px;
            max-width: 500px;
          }
          .icon { font-size: 64px; margin-bottom: 20px; }
          h1 { font-size: 24px; margin-bottom: 12px; color: #ff6b6b; }
          p { font-size: 14px; opacity: 0.8; line-height: 1.6; }
          .details { 
            background: rgba(255,255,255,0.1); 
            padding: 16px; 
            border-radius: 8px; 
            margin-top: 20px;
            font-family: monospace;
            font-size: 12px;
            text-align: left;
            word-break: break-all;
          }
          button {
            margin-top: 24px;
            padding: 12px 24px;
            background: #667eea;
            border: none;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            cursor: pointer;
          }
          button:hover { background: #5a6fd6; }
        </style>
      </head>
      <body>
        <div class="error">
          <div class="icon">⚠️</div>
          <h1>Failed to Start</h1>
          <p>The application encountered an error during startup.</p>
          <div class="details">${errorMessage}</div>
          <button onclick="location.reload()">Retry</button>
        </div>
      </body>
    </html>
  `)
}

// ============================================
// SERVER MANAGEMENT
// ============================================

/**
 * Wait for server to be ready
 */
function waitForServer(port, maxAttempts = MAX_SERVER_WAIT_ATTEMPTS) {
  return new Promise((resolve, reject) => {
    let attempts = 0

    const check = () => {
      attempts++
      if (attempts % 10 === 0) {
        console.log(`Waiting for server on port ${port} (attempt ${attempts}/${maxAttempts})`)
      }

      const req = http.get(`http://localhost:${port}/auth/login`, (res) => {
        // Accept any response as "server is up"
        if (res.statusCode >= 200 && res.statusCode < 500) {
          console.log(`Server ready on port ${port} (status: ${res.statusCode})`)
          resolve()
        } else {
          retry()
        }
      })

      req.on('error', () => retry())
      req.setTimeout(2000, () => {
        req.destroy()
        retry()
      })
    }

    const retry = () => {
      if (attempts >= maxAttempts) {
        reject(new Error(`Server not available on port ${port} after ${maxAttempts} attempts`))
      } else {
        setTimeout(check, 500)
      }
    }

    check()
  })
}

/**
 * Start Next.js server in production
 * Run directly in process instead of spawning to avoid Electron binary issue
 */
function startNextServer(port) {
  return new Promise((resolve, reject) => {
    const appDir = path.join(process.resourcesPath, 'app')
    const serverPath = path.join(appDir, 'server.js')

    console.log('=== Starting Next.js Server ===')
    console.log('Server path:', serverPath)
    console.log('App directory:', appDir)
    console.log('Port:', port)

    if (!fs.existsSync(serverPath)) {
      reject(new Error(`Server not found at ${serverPath}`))
      return
    }

    try {
      // Set environment for the server
      process.env.PORT = String(port)
      process.env.HOSTNAME = '127.0.0.1'
      process.env.NODE_ENV = 'production'

      // Change to app directory
      process.chdir(appDir)

      // Require and run the server directly
      // This runs Next.js in the same process as Electron
      require(serverPath)

      console.log('Next.js server module loaded')
      resolve()
    } catch (err) {
      console.error('Failed to start Next.js:', err)
      reject(err)
    }
  })
}

/**
 * Stop Next.js server
 */
function stopNextServer() {
  if (nextProcess) {
    console.log('Stopping Next.js server...')
    nextProcess.kill('SIGTERM')
    nextProcess = null
  }
}

// ============================================
// HARDWARE IPC HANDLERS
// ============================================

// Get app info
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  userDataPath: getUserDataPath(),
  isPackaged: app.isPackaged,
  port: currentPort,
}))

// Network Printer (ESC/POS over TCP)
ipcMain.handle('printer:print-network', async (event, { ip, port, data }) => {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    socket.setTimeout(10000)

    socket.connect(parseInt(port) || 9100, ip, () => {
      socket.write(Buffer.from(data), (err) => {
        if (err) {
          socket.destroy()
          reject(err)
        } else {
          socket.end()
          resolve({ success: true })
        }
      })
    })

    socket.on('error', (err) => reject(err))
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error('Connection timeout'))
    })
  })
})

// Generate ESC/POS receipt data
ipcMain.handle('escpos:generate-receipt', async (event, receiptData) => {
  try {
    // receiptData contains { saleData, settings }
    const { saleData, settings } = receiptData || {}

    if (!saleData) {
      return { success: false, error: 'No sale data provided' }
    }

    // Transform saleData (API response) into receipt format
    const receiptFormat = {
      storeName: settings?.store_name || settings?.storeName || 'POS Store',
      storeEmail: settings?.store_email || '',
      storePhone: settings?.store_phone || '',
      storeAddress: settings?.store_address || '',
      headerMessage: settings?.receipt_header || '',
      items: (saleData.saleItems || []).map(item => ({
        name: item.product?.name || item.name || 'Item',
        quantity: item.quantity || 1,
        total: item.totalPrice || (item.unitPrice * item.quantity) || 0
      })),
      subtotal: saleData.subtotal || 0,
      tax: saleData.taxAmount || 0,
      total: saleData.totalAmount || 0,
      paymentMethod: saleData.paymentMethod || 'CASH',
      saleNumber: saleData.saleNumber || `SALE-${Date.now()}`,
      cashier: saleData.cashier?.fullName || 'Staff',
      date: saleData.createdAt ? new Date(saleData.createdAt).toLocaleDateString() : new Date().toLocaleDateString(),
      time: saleData.createdAt ? new Date(saleData.createdAt).toLocaleTimeString() : new Date().toLocaleTimeString(),
      footer: settings?.receipt_footer || settings?.receiptFooter || 'Thank you for your purchase!'
    }

    const data = generateEscPosReceipt(receiptFormat)
    return { success: true, data }
  } catch (err) {
    console.error('Failed to generate receipt:', err)
    return { success: false, error: err.message }
  }
})

// Kick cash drawer via network
ipcMain.handle('cashdrawer:kick', async (event, { ip, port }) => {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    socket.setTimeout(5000)

    socket.connect(parseInt(port) || 9100, ip, () => {
      // ESC/POS cash drawer kick command
      const kickCommand = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA])
      socket.write(kickCommand, (err) => {
        if (err) {
          socket.destroy()
          reject(err)
        } else {
          socket.end()
          resolve({ success: true })
        }
      })
    })

    socket.on('error', (err) => reject(err))
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error('Connection timeout'))
    })
  })
})

// Serial Port operations
ipcMain.handle('serial:list-ports', async () => {
  try {
    if (!SerialPort) {
      const { SerialPort: SP } = require('serialport')
      SerialPort = SP
    }
    const ports = await SerialPort.list()
    return ports
  } catch (err) {
    console.error('Failed to list serial ports:', err)
    return []
  }
})

ipcMain.handle('serial:open', async (event, { path: portPath, baudRate }) => {
  try {
    if (!SerialPort) {
      const { SerialPort: SP } = require('serialport')
      SerialPort = SP
    }

    // Close existing port if open
    if (openPorts.has(portPath)) {
      const existing = openPorts.get(portPath)
      if (existing.isOpen) {
        existing.close()
      }
      openPorts.delete(portPath)
    }

    const port = new SerialPort({
      path: portPath,
      baudRate: baudRate || 9600,
    })

    openPorts.set(portPath, port)

    // Set up data handler
    port.on('data', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('serial:data', {
          port: portPath,
          data: data.toString(),
        })
      }
    })

    port.on('error', (err) => {
      console.error(`Serial port ${portPath} error:`, err)
    })

    return { success: true, path: portPath }
  } catch (err) {
    console.error('Failed to open serial port:', err)
    throw err
  }
})

ipcMain.handle('serial:write', async (event, { path: portPath, data }) => {
  try {
    const port = openPorts.get(portPath)
    if (!port || !port.isOpen) {
      throw new Error('Port not open')
    }

    return new Promise((resolve, reject) => {
      port.write(Buffer.from(data), (err) => {
        if (err) reject(err)
        else resolve({ success: true })
      })
    })
  } catch (err) {
    console.error('Failed to write to serial port:', err)
    throw err
  }
})

ipcMain.handle('serial:close', async (event, { path: portPath }) => {
  try {
    const port = openPorts.get(portPath)
    if (port && port.isOpen) {
      port.close()
    }
    openPorts.delete(portPath)
    return { success: true }
  } catch (err) {
    console.error('Failed to close serial port:', err)
    throw err
  }
})

// ============================================
// ESC/POS RECEIPT GENERATION
// ============================================

/**
 * Generate ESC/POS commands for receipt
 */
function generateEscPosReceipt(data) {
  // Ensure all required fields have defaults
  const storeName = data?.storeName || 'Store'
  const storeEmail = data?.storeEmail || ''
  const storePhone = data?.storePhone || ''
  const storeAddress = data?.storeAddress || ''
  const headerMessage = data?.headerMessage || ''
  const items = Array.isArray(data?.items) ? data.items : []
  const subtotal = Number(data?.subtotal) || 0
  const tax = Number(data?.tax) || 0
  const total = Number(data?.total) || 0
  const paymentMethod = data?.paymentMethod || 'CASH'
  const saleNumber = data?.saleNumber || '0000'
  const cashier = data?.cashier || 'Staff'
  const date = data?.date || new Date().toLocaleDateString()
  const time = data?.time || new Date().toLocaleTimeString()
  const footer = data?.footer || 'Thank you for shopping!'

  const commands = []

  // Initialize printer
  commands.push(Buffer.from([0x1B, 0x40])) // ESC @

  // Center align
  commands.push(Buffer.from([0x1B, 0x61, 0x01])) // ESC a 1

  // Bold on, double size for store name
  commands.push(Buffer.from([0x1B, 0x45, 0x01])) // ESC E 1
  commands.push(Buffer.from([0x1D, 0x21, 0x11])) // GS ! 17

  // Store name (top)
  commands.push(Buffer.from(storeName + '\n', 'utf8'))

  // Reset size
  commands.push(Buffer.from([0x1D, 0x21, 0x00])) // GS ! 0
  commands.push(Buffer.from([0x1B, 0x45, 0x00])) // ESC E 0

  // Email (if available)
  if (storeEmail) {
    commands.push(Buffer.from(storeEmail + '\n', 'utf8'))
  }

  // Phone (if available)
  if (storePhone) {
    commands.push(Buffer.from(storePhone + '\n', 'utf8'))
  }

  // Address (if available)
  if (storeAddress) {
    commands.push(Buffer.from(storeAddress + '\n', 'utf8'))
  }

  // Header message (if set)
  if (headerMessage) {
    commands.push(Buffer.from('--------------------------------\n', 'utf8'))
    commands.push(Buffer.from(headerMessage + '\n', 'utf8'))
  }

  // Separator
  commands.push(Buffer.from('--------------------------------\n', 'utf8'))

  // Left align for sale info
  commands.push(Buffer.from([0x1B, 0x61, 0x00])) // ESC a 0

  // Sale info
  commands.push(Buffer.from('Sale #: ' + saleNumber + '\n', 'utf8'))
  commands.push(Buffer.from('Date: ' + date + '\n', 'utf8'))
  commands.push(Buffer.from('Time: ' + time + '\n', 'utf8'))

  // Separator
  commands.push(Buffer.from('--------------------------------\n', 'utf8'))

  // Items
  for (const item of items) {
    const name = (item?.name || 'Item').substring(0, 20).padEnd(20)
    const qty = String(item?.quantity || 1).padStart(3)
    const price = ('¥' + (Number(item?.total) || 0).toFixed(0)).padStart(8)
    commands.push(Buffer.from(`${name}${qty}${price}\n`, 'utf8'))
  }

  // Separator
  commands.push(Buffer.from('--------------------------------\n', 'utf8'))

  // Right align for totals
  commands.push(Buffer.from([0x1B, 0x61, 0x02])) // ESC a 2

  // Totals with yen symbol
  commands.push(Buffer.from(`Subtotal: ¥${subtotal.toFixed(0)}\n`, 'utf8'))
  if (tax > 0) {
    commands.push(Buffer.from(`Tax: ¥${tax.toFixed(0)}\n`, 'utf8'))
  }

  // Bold for total
  commands.push(Buffer.from([0x1B, 0x45, 0x01])) // ESC E 1
  commands.push(Buffer.from(`TOTAL: ¥${total.toFixed(0)}\n`, 'utf8'))
  commands.push(Buffer.from([0x1B, 0x45, 0x00])) // ESC E 0

  // Payment method
  commands.push(Buffer.from(`Payment: ${paymentMethod}\n`, 'utf8'))

  // Separator
  commands.push(Buffer.from('--------------------------------\n', 'utf8'))

  // Center align for footer
  commands.push(Buffer.from([0x1B, 0x61, 0x01])) // ESC a 1
  commands.push(Buffer.from(footer + '\n', 'utf8'))
  commands.push(Buffer.from('\n\n\n', 'utf8'))

  // Cut paper
  commands.push(Buffer.from([0x1D, 0x56, 0x00])) // GS V 0

  // Combine all commands
  return Buffer.concat(commands)
}

// ============================================
// APP LIFECYCLE
// ============================================

// Single instance lock - prevents multiple app windows
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('Another instance is running, quitting...')
  app.quit()
} else {
  app.on('second-instance', () => {
    // Focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(createWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}

app.on('window-all-closed', async () => {
  // Clear ALL session data immediately when window closes
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const ses = mainWindow.webContents.session
      // Clear everything: cookies, localStorage, sessionStorage, indexeddb, cache
      await Promise.race([
        ses.clearStorageData({
          storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'cachestorage', 'shadercache', 'websql']
        }),
        new Promise(resolve => setTimeout(resolve, 2000)) // Max 2s wait
      ])
      // Also clear cookies explicitly
      const cookies = await ses.cookies.get({})
      for (const cookie of cookies) {
        const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`
        await ses.cookies.remove(url, cookie.name).catch(() => { })
      }
      console.log('Session cleared - user will need to login on next launch')
    } catch (err) {
      console.error('Failed to clear session:', err)
    }
  }

  // Close all serial ports
  for (const [portPath, port] of openPorts) {
    try {
      if (port.isOpen) port.close()
    } catch (e) {
      console.error(`Failed to close port ${portPath}:`, e)
    }
  }
  openPorts.clear()

  // Stop server
  stopNextServer()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Session already cleared in window-all-closed
  stopNextServer()
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason)
})
