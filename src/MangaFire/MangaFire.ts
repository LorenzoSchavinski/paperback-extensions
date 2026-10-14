import { Source, SourceInfo, SourceIntents, ContentRating, Request, Response, SearchRequest, PagedResults, SourceManga, Chapter, ChapterDetails, HomeSection } from '@paperback/types'
import { normalizeText, sourceDocumentUrl } from '../shared/Urls'
import { mangaFireApiUrl } from './Signing'
import { mangaFireSections, mangaFireTrendingCards, mangaFireGenres } from './Browsing'
import { MANGAFIRE_BASE, mangaFireHid, mangaFireChapterId, mangaFireList, mangaFireCard, mangaFireDetails, mangaFireChapter, mangaFirePages } from './Parsing'
import { DiscoveryCache } from '../shared/discovery/Cache'
import { GenreCache } from '../shared/discovery/Genres'
import { DiscoveryPage, createDiscoveryPage } from '../shared/discovery/Page'

export const MangaFireInfo: SourceInfo = {
  name: 'MangaFire', version: '0.3.6', icon: 'mangafire.png', author: 'Lorenzo',
  description: 'Self-owned MangaFire source', websiteBaseURL: 'https://mangafire.to',
  contentRating: ContentRating.MATURE, sourceTags: [],
  intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS
}
export class MangaFire extends Source {
  private readonly discovery = new DiscoveryCache<DiscoveryPage>()
  private readonly genres = new GenreCache(MANGAFIRE_BASE)
  requestManager = App.createRequestManager({
    requestsPerSecond: 6, requestTimeout: 25000,
    interceptor: {
      interceptRequest: async (request: Request): Promise<Request> => {
        request.headers = { ...(request.headers || {}), Accept: 'application/json', Referer: MANGAFIRE_BASE + '/', 'X-Requested-With': 'XMLHttpRequest' }
        return request
      },
      interceptResponse: async (response: Response): Promise<Response> => response
    }
  })

  getCloudflareBypassRequest(): Request { return App.createRequest({ url: MANGAFIRE_BASE, method: 'GET' }) }

  protected async api(path: string, parameters: Record<string, string | number> = {}): Promise<unknown> {
    const response = await this.requestManager.schedule(App.createRequest({ url: mangaFireApiUrl(path, parameters), method: 'GET' }), 1)
    if (response.status === 403) throw new Error('MangaFire rejected this request. Its public request signature or browser access requirements may have changed. Open the source website in Paperback, then retry.')
    if (response.status < 200 || response.status >= 300) throw new Error(`MangaFire API HTTP ${response.status} at ${path}`)
    if (typeof response.data !== 'string') return response.data
    try { return JSON.parse(response.data) as unknown } catch (_) { throw new Error(`MangaFire returned a browser challenge or invalid JSON at ${path}`) }
  }

  async getSearchResults(query: SearchRequest, metadata: { page?: number; query?: SearchRequest } | undefined): Promise<PagedResults> {
    query = metadata?.query ?? query
    const page = Math.max(1, Math.min(1000, Math.floor(Number(metadata?.page) || 1)))
    const title = normalizeText(query?.title)
    const parameters: Record<string, string | number> = { page, limit: 30, 'order[chapter_updated_at]': 'desc' }
    if (title) { parameters.keyword = title; delete parameters['order[chapter_updated_at]']; parameters['order[relevance]'] = 'desc' }
    for (const [tags, key] of [[query.includedTags, 'genres_in'], [query.excludedTags, 'genres_ex']] as const) {
      if (tags?.length) {
        if (tags.some(tag => !/^\d+$/.test(tag.id))) throw new Error('Invalid MangaFire genre selection')
        tags.forEach((tag, index) => { parameters[`${key}[${index}]`] = tag.id })
      }
    }
    const results = await this.catalog(parameters, page)
    if (results.metadata && (query.includedTags?.length || query.excludedTags?.length)) results.metadata = { ...results.metadata, query }
    return results
  }

  private async catalog(parameters: Record<string, string | number>, page: number): Promise<PagedResults> {
    return createDiscoveryPage(await this.catalogPage(parameters, page))
  }

  private async catalogPage(parameters: Record<string, string | number>, page: number): Promise<DiscoveryPage> {
    const list = mangaFireList(await this.api('/titles', parameters))
    if (list.page !== page) throw new Error('MangaFire repeated the wrong catalog page')
    const results = list.items.map(mangaFireCard)
    if (!results.length && list.hasNext) throw new Error('MangaFire returned an incomplete catalog page')
    return { results, metadata: list.hasNext ? { page: page + 1 } : undefined }
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const { genres, ...details } = mangaFireDetails(this.cheerio, await this.api(`/titles/${mangaFireHid(mangaId)}`), mangaId)
    const tags = genres.length ? [App.createTagSection({ id: 'genres', label: 'Genres', tags: genres.map(genre => App.createTag(genre)) })] : []
    return App.createSourceManga({ id: mangaId, mangaInfo: App.createMangaInfo({ ...details, tags }) })
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const hid = mangaFireHid(mangaId)
    const found = new Map<string, Chapter>()
    for (let page = 1; page <= 250; page++) {
      const list = mangaFireList(await this.api(`/titles/${hid}/chapters`, { language: 'en', sort: 'number', order: 'desc', limit: 200, page }))
      if (list.page !== page || list.lastPage > 250) throw new Error('MangaFire chapter pagination did not finish')
      const before = found.size
      for (const item of list.items) {
        const chapter = mangaFireChapter(item, mangaId)
        if (!found.has(chapter.id)) found.set(chapter.id, App.createChapter(chapter))
      }
      if (list.hasNext && found.size === before) throw new Error('MangaFire repeated an empty or duplicate chapter page')
      if (!list.hasNext) {
        if (!found.size) throw new Error('MangaFire has no English chapters for this manga')
        if (found.size !== list.total) throw new Error(`Incomplete MangaFire chapter list: ${found.size} of ${list.total}`)
        return [...found.values()].sort((a, b) => b.chapNum - a.chapNum)
      }
    }
    throw new Error('MangaFire chapter pagination exceeded its limit')
  }

  async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
    const pages = mangaFirePages(await this.api(`/chapters/${mangaFireChapterId(chapterId)}`), mangaId, chapterId)
    return App.createChapterDetails({ id: chapterId, mangaId, pages })
  }

  async getHomePageSections(callback: (section: HomeSection) => void): Promise<void> {
    const sections = mangaFireSections.map(definition => {
      const section = App.createHomeSection({ id: definition.id, title: definition.title, type: 'singleRowNormal', containsMoreItems: definition.id !== 'daily', items: [] })
      callback(section)
      return section
    })
    await this.genres.prepare(() => this.fetchGenres())
    const outcomes = await Promise.allSettled(sections.map(async section => {
      const page = await this.discoveryPage(section.id, 1)
      section.items = page.results.slice(0, 10).map(card => App.createPartialSourceManga(card))
      section.containsMoreItems = page.results.length > section.items.length || !!page.metadata
      callback(section)
    }))
    for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason
  }
  async getViewMoreItems(id: string, metadata: { page?: number } | undefined): Promise<PagedResults> {
    const page = Math.max(1, Math.min(1000, Math.floor(Number(metadata?.page) || 1)))
    return createDiscoveryPage(await this.discoveryPage(id, page))
  }

  private async discoveryPage(id: string, page: number): Promise<DiscoveryPage> {
    const section = mangaFireSections.find(section => section.id === id)
    if (!section) throw new Error('Unknown MangaFire home section')
    const load = async () => id === 'daily'
      ? { results: mangaFireTrendingCards(await this.api('/top-titles', { type: 'trending', days: 1, limit: 30 })) }
      : this.catalogPage({ page, limit: 30, [`order[${section.order}]`]: 'desc' }, page)
    return page > 1 ? await load() : await this.discovery.load(id, load)
  }
  async getSearchTags() {
    const genres = await this.loadGenres()
    return [App.createTagSection({ id: 'genres', label: 'Genres', tags: genres.map(tag => App.createTag(tag)) })]
  }
  private loadGenres() { return this.genres.load(() => this.fetchGenres()) }
  private async fetchGenres() { return mangaFireGenres(await this.api('/filter-options')) }
  getMangaShareUrl(mangaId: string): string { return sourceDocumentUrl(mangaId, MANGAFIRE_BASE) }
}
