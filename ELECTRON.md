# Electron Setup for POS System

This document explains how to run and build the POS system as an Electron desktop application.

## Prerequisites

- Node.js 18+ 
- npm or yarn

## Development

### Running in Browser (Normal Next.js)
```bash
npm run dev
```

### Running in Electron (Development)
```bash
npm run electron:dev
```
This will start Next.js dev server and Electron simultaneously.

## Production Build

### Build for Current Platform
```bash
npm run electron:build
```

### Build Unpacked (for testing)
```bash
npm run electron:pack
```

## Hardware Support

### Browser Mode (Limited)
- **Receipt Printer**: Browser print dialog only
- **Barcode Scanner**: Keyboard wedge mode only (scanner types as keyboard)
- **Cash Drawer**: Not supported

### Electron Mode (Full Support)
- **Receipt Printer**: 
  - Network/LAN (ESC/POS over TCP port 9100)
  - USB (via serialport)
  - Serial (via serialport)
- **Barcode Scanner**:
  - Keyboard wedge (default, works everywhere)
  - USB HID
  - Serial port
- **Cash Drawer**: ESC/POS command via network printer

## Configuration

Hardware settings are configured in **Admin > Settings > Hardware**:

1. **Printer Type**: Choose from Browser Print, Network, USB, or Serial
2. **Printer IP/Port**: For network printers (default port 9100)
3. **Scanner Mode**: Keyboard Wedge (recommended) or Serial

## Database

The SQLite database is stored at:
- **Development**: `prisma/dev.db`
- **Production (Electron)**: `[User Data]/pos.db`

## Troubleshooting

### Printer not working
1. Check printer is on same network
2. Verify IP address and port (usually 9100)
3. Try "Test Connection" button in settings

### Scanner not detecting
1. Most USB scanners work in "Keyboard Wedge" mode by default
2. Focus must be on the search/SKU input field
3. For serial scanners, ensure port is selected in settings

### Database issues
```bash
# Reset and reseed database
npx prisma migrate reset
```
