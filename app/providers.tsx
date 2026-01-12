"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { SettingsProvider } from "@/components/settings-provider"

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Cache data for 5 minutes before considering it stale
        staleTime: 5 * 60 * 1000,
        // Keep unused data in cache for 10 minutes
        gcTime: 10 * 60 * 1000,
        // Don't refetch on window focus (annoying for POS)
        refetchOnWindowFocus: false,
        // Don't refetch on reconnect
        refetchOnReconnect: false,
        // Retry failed requests once
        retry: 1,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        {children}
      </SettingsProvider>
    </QueryClientProvider>
  )
}
