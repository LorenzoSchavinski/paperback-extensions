import { DiscoveryCard, discoveryCards } from './Discovery'

export const ASURA_API = 'https://api.asurascans.com/api'
const ASURA_PAGE_SIZE = 20
export interface AsuraCatalog { cards: DiscoveryCard[]; hasMore: boolean }

/** Public JSON catalog metadata is offset based; manga ids stay website paths. */
export function asuraCatalog(value: unknown, page: number, previousIds?: string[]): AsuraCatalog {
  const response = value as { data?: unknown; meta?: { total?: number; per_page?: number; has_more?: boolean } }
  const meta = response?.meta
  if (!Array.isArray(response?.data) || !meta || !Number.isInteger(meta.total) || meta.total! < 0 ||
      meta.per_page !== ASURA_PAGE_SIZE || typeof meta.has_more !== 'boolean') {
    throw new Error('Invalid Asura catalog pagination')
  }
  const cards = discoveryCards(response.data, true)
  const ids = cards.map(card => card.mangaId)
  if (cards.length !== response.data.length || cards.length > ASURA_PAGE_SIZE || (meta.has_more && !cards.length) ||
      (cards.length === 0 && (page - 1) * ASURA_PAGE_SIZE < meta.total!)) {
    throw new Error('Asura returned an incomplete catalog page')
  }
  if (page > 1 && previousIds?.length === ids.length && ids.every((id, index) => id === previousIds[index])) {
    throw new Error('Asura repeated the previous catalog page')
  }
  return { cards, hasMore: meta.has_more }
}

export function asuraCatalogUrl(page: number): string {
  return `${ASURA_API}/series?limit=${ASURA_PAGE_SIZE}&offset=${(page - 1) * ASURA_PAGE_SIZE}&sort=latest&order=desc`
}
