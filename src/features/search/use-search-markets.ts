import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchUnifiedEvents } from '@/shared/api/aggregated-markets'
import { unifiedEventMatchesQuery } from '@/shared/lib/unified-event-matching'

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

  const { data: results = [], isLoading } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: async () => {
      const events = await fetchUnifiedEvents({ limit: 120, active: true, closed: false })
      return events.filter((e) => unifiedEventMatchesQuery(e, debouncedQuery)).slice(0, 10)
    },
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
