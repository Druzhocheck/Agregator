import type { PlatformId } from '@/entities/market/types'

const PLATFORM_LOGO: Record<PlatformId, string> = {
  polymarket: '/img/platforms/polymarket.svg',
  predict: '/img/platforms/predict.svg',
  azuro: '/img/platforms/azuro.svg',
  native: '/img/platforms/native.svg',
}

const PLATFORM_LABEL: Record<PlatformId, string> = {
  polymarket: 'Polymarket',
  predict: 'Predict',
  azuro: 'Azuro',
  native: 'Dreams',
}

export function getPlatformLogoUrl(platform: PlatformId): string {
  return PLATFORM_LOGO[platform] ?? ''
}

export function getPlatformLabel(platform: PlatformId): string {
  return PLATFORM_LABEL[platform] ?? platform
}
