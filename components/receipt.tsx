"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useSettings } from "@/components/settings-provider"
import { Printer } from "lucide-react"
import { useReactToPrint } from "react-to-print"

interface ReceiptProps {
  sale: {
    id: string
    saleNumber: string
    totalAmount: number
    subtotal: number
    taxAmount: number
    discountAmount: number
    paymentMethod: string
    createdAt: string
    cashierId?: string
    cashier?: {
      id: string
      fullName: string
      username: string
    } | null
    saleItems: Array<{
      id: string
      quantity: number
      unitPrice: number
      totalPrice: number
      product: {
        id: string
        name: string
        sku: string
        imagePath?: string | null
      }
    }>
  }
  storeName?: string
  autoPrint?: boolean
}

export default function Receipt({ sale, storeName = "Cat Shop POS", autoPrint = false }: ReceiptProps) {
  const { settings, formatCurrency } = useSettings()
  const componentRef = useRef<HTMLDivElement>(null)

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Receipt-${sale.saleNumber}`,
    onAfterPrint: () => { },
  })

  useEffect(() => {
    if (autoPrint) {
      // Small delay to ensure content is rendered
      const timer = setTimeout(() => {
        handlePrint()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [autoPrint, handlePrint])

  return (
    <div className="max-w-sm mx-auto bg-white p-6">
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => handlePrint()} variant="outline" size="sm">
          <Printer className="mr-2 h-4 w-4" />
          Print Receipt
        </Button>
      </div>

      <div ref={componentRef} className="print:p-4 print:max-w-[80mm] print:mx-auto">
        <Card className="border-0 shadow-none print:border-0 print:shadow-none">
          <CardContent className="p-0">
            {/* Store Header - Logo left, Name right */}
            <div className="mb-4">
              <div className="flex items-center gap-3">
                {/* Logo - top left */}
                {settings.receipt_logo && (
                  <img
                    src={settings.receipt_logo}
                    alt="Store Logo"
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                {/* Store Name and Contact */}
                <div className="flex-1">
                  <h2 className="text-xl font-bold">{settings.store_name || storeName}</h2>
                  {settings.store_email && (
                    <p className="text-xs text-gray-600">{settings.store_email}</p>
                  )}
                  {settings.store_phone && (
                    <p className="text-xs text-gray-600">{settings.store_phone}</p>
                  )}
                </div>
              </div>
              {/* Address - below */}
              {settings.store_address && (
                <p className="text-xs text-gray-600 mt-1 text-center">{settings.store_address}</p>
              )}
            </div>

            {/* Receipt Header Message (if set) */}
            {settings.receipt_header && (
              <div className="text-center text-sm text-gray-700 mb-4 border-t border-b border-dashed border-gray-300 py-2">
                <p className="whitespace-pre-line">{settings.receipt_header}</p>
              </div>
            )}

            {/* Sale Info */}
            <div className="mb-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Sale #:</span>
                <span className="font-mono">{sale.saleNumber}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Date:</span>
                <span>{new Date(sale.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Time:</span>
                <span>{new Date(sale.createdAt).toLocaleTimeString()}</span>
              </div>
            </div>

            {/* Items */}
            <div className="mb-4">
              <div className="border-t border-b border-dashed border-gray-300 py-2">
                {sale.saleItems.map((item) => (
                  <div key={item.id} className="mb-2 last:mb-0">
                    <div className="flex justify-between items-start">
                      {item.product.imagePath && (
                        <img
                          src={item.product.imagePath}
                          alt={item.product.name}
                          className="w-10 h-10 object-cover rounded mr-2 print:hidden"
                        />
                      )}
                      <div className="flex-1 pr-2">
                        <p className="text-sm font-medium">{item.product.name}</p>
                        <p className="text-xs text-gray-600">
                          {item.quantity} × {formatCurrency(item.unitPrice)}
                        </p>
                      </div>
                      <div className="text-sm font-medium">
                        {formatCurrency(item.totalPrice)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-1 border-b border-dashed border-gray-300 pb-2 mb-4">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>{formatCurrency(sale.subtotal)}</span>
              </div>
              {sale.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Discount:</span>
                  <span>-{formatCurrency(sale.discountAmount)}</span>
                </div>
              )}
              {sale.taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Tax:</span>
                  <span>{formatCurrency(sale.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-dashed border-gray-300 mt-2">
                <span>Total:</span>
                <span>{formatCurrency(sale.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm pt-1">
                <span>Payment:</span>
                <span className="capitalize">{sale.paymentMethod.replace('_', ' ')}</span>
              </div>
            </div>

            {/* Footer Message */}
            <div className="text-center text-xs text-gray-600">
              <p className="whitespace-pre-line">{settings.receipt_footer || 'Thank you for your purchase!'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            margin: 0;
            size: auto;
          }
          body * {
            visibility: hidden;
          }
          .print\:hidden {
            display: none !important;
          }
          /* Target the ref content specifically */
          div[class*="print:max-w-[80mm]"],
          div[class*="print:max-w-[80mm]"] * {
            visibility: visible;
          }
          div[class*="print:max-w-[80mm]"] {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}

