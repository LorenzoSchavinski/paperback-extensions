import { SourceInfo, SourceIntents, ContentRating, HomeSection, SearchRequest, PagedResults, TagSection } from '@paperback/types'
import { HtmlSource } from '../shared/HtmlSource'
import { SiteConfig } from '../shared/Config'
import { discoveryCards, discoveryGenres, featuredCards } from './Discovery'
import { ASURA_API, AsuraCatalog, asuraCatalog, asuraCatalogUrl } from './Catalog'
import { DiscoveryCache } from '../shared/discovery/Cache'
import { GenreCache } from '../shared/discovery/Genres'
import { normalizeText } from '../shared/Urls'
import { assertCatalogResults } from '../shared/html/Catalog'
import { nextDocumentPage } from '../shared/html/Pagination'

export const AsuraScansInfo: SourceInfo = {
  name: 'AsuraScans', version: '0.3.6', icon: 'asura.png', author: 'Lorenzo',
  description: 'Self-owned AsuraScans source', websiteBaseURL: 'https://asurascans.com',
  contentRating: ContentRating.MATURE, sourceTags: [],
  intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS
}
const config: SiteConfig = {
  base: 'https://asurascans.com',
  cards: 'a[href*="/comics/"]:has(img)',
  emptyResults: 'main h2',
  mangaPath: /^\/comics\/[^/]+$/i,
  chapters: 'a[data-astro-prefetch][href*="/comics/"][href*="/chapter/"]',
  chapterName: '.min-w-0.flex-1',
  chapterPath: /^\/comics\/[^/]+\/chapter\/[^/]+$/i,
  reader: 'img[data-page-index][alt^="Page "]',
  readerMustHaveAltPage: true,
  cover: '#mobile-cover-img, img[src*="/covers/"]',
  description: '#description-text',
}
interface DiscoveryMetadata { page?: number; previousIds?: string[]; title?: string; genres?: string[] }
const sections = [
  { id: 'trending', title: 'Trending', more: false },
  { id: 'latest', title: 'Latest Updates', more: true },
  { id: 'week', title: 'Popular This Week', more: false },
  { id: 'month', title: 'Popular This Month', more: false },
  { id: 'all', title: 'Popular All Time', more: false },
  { id: 'featured', title: 'Featured', more: false }
]

export class AsuraScans extends HtmlSource {
  protected config = config
  private discoveryCache = new DiscoveryCache<AsuraCatalog>()
  private readonly genres = new GenreCache(config.base)

  async getSearchTags(): Promise<TagSection[]> {
    const genres = await this.loadGenres()
    return [App.createTagSection({ id: 'genres', label: 'Genres', tags: genres.map(tag => App.createTag(tag)) })]
  }

  private loadGenres() {
    return this.genres.load(() => this.fetchGenres())
  }

  private async fetchGenres() { return discoveryGenres(this.cheerio, (await this.getHtml('/browse')).body) }

  async getSearchResults(query: SearchRequest, metadata: DiscoveryMetadata | undefined): Promise<PagedResults> {
    if (query?.excludedTags?.length) throw new Error('Asura does not support excluded genres. Use included genres instead.')
    const title = metadata?.title ?? normalizeText(query?.title)
    const genres = metadata?.genres ?? (query?.includedTags || []).map(tag => tag.id)
    if (genres.some(genre => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(genre))) throw new Error('Invalid Asura genre')
    const page = Math.max(1, Math.min(1000, Math.floor(Number(metadata?.page) || 1)))
    const parameters = [title ? `q=${encodeURIComponent(title)}` : '', genres.length ? `genres=${encodeURIComponent(genres.join(','))}` : '', `page=${page}`].filter(Boolean)
    const { body, url } = await this.getHtml('/browse?' + parameters.join('&'))
    const results = this.parseCards(body, url)
    assertCatalogResults(this.cheerio, body, results.length, url, this.config)
    const ids = results.map(result => result.mangaId)
    if (page > 1 && metadata?.previousIds && ids.length === metadata.previousIds.length && ids.every((id, index) => id === metadata.previousIds?.[index])) {
      throw new Error(`Website repeated the previous catalog page at ${url}. Pagination needs an update.`)
    }
    const next = nextDocumentPage(this.cheerio, body, url, this.config.base)
    const nextPage = next ? Number(/(?:[?&])page=(\d+)/i.exec(next)?.[1]) : 0
    return App.createPagedResults({ results, metadata: results.length && nextPage > page ? { page: nextPage, previousIds: ids, title, genres } : undefined })
  }

  async getHomePageSections(callback: (section: HomeSection) => void): Promise<void> {
    const rows = sections.map(definition => App.createHomeSection({
      id: definition.id, title: definition.title, type: 'singleRowNormal', containsMoreItems: definition.more, items: []
    }))
    rows.forEach(callback)
    await this.genres.prepare(() => this.fetchGenres())
    // Start compact API rows first; the genuine featured carousel is HTML only.
    const pending = rows.map(async row => {
      const result = await this.discoveryCache.load(row.id, async () => {
        if (row.id === 'featured') {
          const { body } = await this.getHtml('/')
          return { cards: featuredCards(this.cheerio, body), hasMore: false }
        }
        if (row.id === 'latest') return this.loadLatest(1)
        const value = await this.apiJson(`${ASURA_API}/trending/${row.id}?limit=10`)
        const cards = discoveryCards((value as { data?: unknown })?.data)
        return { cards, hasMore: false }
      })
      row.items = (row.id === 'latest' ? result.cards.slice(0, 10) : result.cards).map(card => App.createPartialSourceManga(card))
      row.containsMoreItems = result.hasMore
      callback(row)
    })
    const results = await Promise.allSettled(pending)
    for (const result of results) if (result.status === 'rejected') throw result.reason
  }

  async getViewMoreItems(id: string, metadata: DiscoveryMetadata | undefined): Promise<PagedResults> {
    if (id !== 'latest' && id !== 'browse') throw new Error('This Asura section has no additional pages')
    // Search metadata retains its exact filters and HTML page numbering.
    if (id === 'browse' || metadata?.title !== undefined || metadata?.genres !== undefined) {
      return this.getSearchResults({ title: '' } as SearchRequest, metadata)
    }
    const page = Math.max(1, Math.min(1000, Math.floor(Number(metadata?.page) || 1)))
    const result = page === 1
      ? await this.discoveryCache.load('latest', () => this.loadLatest(1))
      : await this.loadLatest(page, metadata?.previousIds)
    return App.createPagedResults({
      results: result.cards.map(card => App.createPartialSourceManga(card)),
      metadata: result.hasMore ? { page: page + 1, previousIds: result.cards.map(card => card.mangaId) } : undefined
    })
  }

  private async loadLatest(page: number, previousIds?: string[]): Promise<AsuraCatalog> {
    return asuraCatalog(await this.apiJson(asuraCatalogUrl(page)), page, previousIds)
  }

  private async apiJson(url: string): Promise<unknown> {
    const response = await this.requestManager.schedule(App.createRequest({ url, method: 'GET' }), 1)
    if (response.status === 403 || response.status === 503) throw new Error(`Asura access blocked (HTTP ${response.status}). Open the source website in Paperback to check access.`)
    if (response.status < 200 || response.status >= 300) throw new Error(`Asura API HTTP ${response.status} at ${url}`)
    if (typeof response.data !== 'string') return response.data
    try { return JSON.parse(response.data) as unknown } catch (_) { throw new Error(`Asura sent invalid JSON or a browser challenge at ${url}`) }
  }
}
