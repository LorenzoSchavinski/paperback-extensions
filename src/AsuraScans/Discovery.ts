import type { CheerioAPI } from 'cheerio'
import { absoluteUrl, normalizeText, pageId } from '../shared/Urls'

const base = 'https://asurascans.com'
export interface DiscoveryCard { mangaId: string; title: string; image: string }
type RecordValue = Record<string, unknown>

/** Decode Astro's public serialization without evaluating site scripts. */
function decode(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value[0] === 1 && Array.isArray(value[1])) return value[1].map(decode)
    if (value[0] === 0) return decode(value[1])
    throw new Error('Unsupported Asura discovery serialization')
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]))
  return value
}

function islandProperties(cheerio: CheerioAPI, html: string, component: string): RecordValue[] {
  // Parse only island opening tags. Quoted attributes can contain HTML and >.
  const tags = html.match(/<astro-island\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) || []
  return tags.filter(tag => tag.includes(`/${component}.`)).map(tag => {
    const $ = cheerio.load(tag, { xmlMode: true })
    const element = $('astro-island')
    if (!element.attr('component-url')?.includes(`/${component}.`)) throw new Error('Invalid Asura discovery component')
    const properties = decode(JSON.parse(element.attr('props') || '{}'))
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error('Invalid Asura discovery properties')
    return properties as RecordValue
  })
}

export function featuredCards(cheerio: CheerioAPI, html: string): DiscoveryCard[] {
  return discoveryCards(islandProperties(cheerio, html, 'HeroCarouselEmbla')[0]?.items)
}

export function discoveryCards(value: unknown, allowEmpty = false): DiscoveryCard[] {
  if (!Array.isArray(value)) throw new Error('Asura discovery list is missing')
  const found = new Map<string, DiscoveryCard>()
  for (const entry of value) {
    const card = discoveryCard(entry)
    if (card && !found.has(card.mangaId)) found.set(card.mangaId, card)
  }
  if (!found.size && (!allowEmpty || value.length)) throw new Error('No manga found in Asura discovery list')
  return [...found.values()]
}

function discoveryCard(value: unknown): DiscoveryCard | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as RecordValue
  const raw = item.public_url
  const mangaId = pageId(absoluteUrl(typeof raw === 'string' ? raw : '', base), base)
  if (!/^\/comics\/[^/]+$/.test(mangaId)) return undefined
  const title = normalizeText(String(item.title || ''))
  const image = absoluteUrl(String(item.cover_url || item.cover || ''), base)
  return title && image ? { mangaId, title, image } : undefined
}

export function discoveryGenres(cheerio: CheerioAPI, html: string): { id: string; label: string }[] {
  const genres = islandProperties(cheerio, html, 'BrowseFilters')[0]?.availableGenres
  if (!Array.isArray(genres)) throw new Error('Asura genre list is missing')
  return genres.flatMap(entry => {
    const genre = entry as RecordValue
    return typeof genre?.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(genre.slug) && typeof genre.name === 'string'
      ? [{ id: genre.slug, label: genre.name }] : []
  })
}
