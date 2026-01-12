'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

interface Settings {
  store_name?: string
  receipt_header?: string
  receipt_footer?: string
  receiptWidth?: string
  currency?: string
  externalApiUrl?: string
  externalApiKey?: string
  [key: string]: string | undefined
}

interface SettingsContextType {
  settings: Settings
  formatCurrency: (amount: number) => string
  refreshSettings: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>({})

  const refreshSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const json = await res.json()
        if (json.data) {
          setSettings(json.data)
        }
      }
    } catch (error) {
      console.error('Failed to fetch settings', error)
    }
  }

  useEffect(() => {
    refreshSettings()
  }, [])

  const formatCurrency = (amount: number) => {
    const currency = settings.currency || 'JPY'
    let locale = 'ja-JP'
    
    // Map currencies to appropriate locales
    switch (currency) {
      case 'HKD': locale = 'en-HK'; break;
      case 'USD': locale = 'en-US'; break;
      case 'JPY': 
      default: locale = 'ja-JP';
    }
    
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        currencyDisplay: 'narrowSymbol',
      }).format(amount)
    } catch (e) {
      // Fallback if currency code is invalid
      const sign = currency === 'JPY' ? '¥' : '$'
      return `${sign}${amount.toFixed(currency === 'JPY' ? 0 : 2)}`
    }
  }

  return (
    <SettingsContext.Provider value={{ settings, formatCurrency, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
