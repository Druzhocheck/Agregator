import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchMarketsEvents } from '@/shared/api/polymarket'

export function useSearchMarkets(debounceMs: number = 300) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState('')

  const debounceRef = { current: null as ReturnType<typeof setTimeout> | null }
  const setQueryDebounced = useCallback(
    (value: string) => {
      setQuery(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => setDebouncedQuery(value), debounceMs)
    },
    [debounceMs]
  )

  const { data: results = { events: [], markets: [] }, isLoading } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchMarketsEvents(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  })

  return {
    query,
    setQuery: setQueryDebounced,
    results,
    isLoading,
    open,
    setOpen,
  }
}
