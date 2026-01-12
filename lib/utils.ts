import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(
  amount: number,
  opts?: { currency?: string; locale?: string }
) {
  const currency = opts?.currency || 'JPY'
  const locale = opts?.locale || 'ja-JP'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(amount || 0)
  } catch {
    // Fallback
    const sign = currency === 'JPY' ? '¥' : '$'
    return `${sign}${(amount || 0).toFixed(0)}`
  }
}
