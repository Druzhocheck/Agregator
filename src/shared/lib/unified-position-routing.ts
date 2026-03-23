import type { UnifiedEvent } from '@/entities/market/types'

export function resolveUnifiedPositionTarget(params: {
  platform: 'polymarket' | 'predict'
  eventSlug?: string | null
  marketId?: number | null
  categorySlug?: string | null
  title?: string | null
  unified: UnifiedEvent[]
}): { canonicalId: string; title: string } | null {
  const { platform, eventSlug, marketId, categorySlug, title, unified } = params
  if (platform === 'polymarket' && eventSlug) {
    const bySlug = unified.find((u) => u.canonicalId === eventSlug)
    if (bySlug) return { canonicalId: bySlug.canonicalId, title: bySlug.title }
  }
  if (platform === 'predict' && marketId != null) {
    const byPredict = unified.find((u) =>
      u.instances.some((i) => i.platform === 'predict' && Number(i.platformId) === marketId)
    )
    if (byPredict) return { canonicalId: byPredict.canonicalId, title: byPredict.title }
  }
  if (platform === 'predict' && categorySlug) {
    const normalized = categorySlug.toLowerCase().trim()
    const byCategory = unified.find((u) =>
      u.instances.some(
        (i) =>
          i.platform === 'predict' &&
          String((i.event as { categorySlug?: string | null }).categorySlug || '')
            .toLowerCase()
            .trim() === normalized
      )
    )
    if (byCategory) return { canonicalId: byCategory.canonicalId, title: byCategory.title }
    return { canonicalId: `predict-${categorySlug}`, title: title?.trim() || categorySlug }
  }
  const q = String(title ?? '').toLowerCase().trim()
  if (!q) return null
  const byTitle = unified.find((u) => u.title.toLowerCase().includes(q) || q.includes(u.title.toLowerCase()))
  return byTitle ? { canonicalId: byTitle.canonicalId, title: byTitle.title } : null
}
