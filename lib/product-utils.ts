// Utility functions for generating product codes

/**
 * Generate a unique SKU code
 * Format: PRD-XXXXXX-XXX (timestamp + random)
 */
export const generateSKU = () => {
    const timestamp = Date.now().toString().slice(-6)
    const random = Math.random().toString(36).substring(2, 5).toUpperCase()
    return `PRD-${timestamp}-${random}`
}

/**
 * Generate a valid EAN-13 barcode
 * Returns a 13-digit string with valid check digit
 */
export const generateBarcode = () => {
    // Generate first 12 random digits
    let barcode = ""
    for (let i = 0; i < 12; i++) {
        barcode += Math.floor(Math.random() * 10).toString()
    }

    // Calculate EAN-13 check digit
    let sum = 0
    for (let i = 0; i < 12; i++) {
        sum += Number.parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3)
    }
    const checkDigit = (10 - (sum % 10)) % 10

    return barcode + checkDigit.toString()
}
