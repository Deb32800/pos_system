import type React from "react"
import type { Metadata } from "next"
import { Toaster } from "@/components/ui/sonner"
import Providers from "./providers"
import "./globals.css"

export const metadata: Metadata = {
  title: "ModernPOS - Point of Sale System",
  description: "Professional point of sale system with inventory management",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="antialiased">
      <body>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
