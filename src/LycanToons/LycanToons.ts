import { Source, SourceInfo, SourceIntents, ContentRating, Request, Response, SearchRequest, PagedResults, SourceManga, Chapter, ChapterDetails, HomeSection } from '@paperback/types'
import { normalizeText, sourceDocumentUrl } from '../shared/Urls'
import { assertReadableDocument } from '../shared/html/Document'
import { DiscoveryCache } from '../shared/discovery/Cache'
import { GenreCache } from '../shared/discovery/Genres'
import { DiscoveryPage, createDiscoveryPage } from '../shared/discovery/Page'
import { loadDiscoverySections } from '../shared/discovery/Sections'
import { LYCAN_BASE, LycanChapter, lycanSlug, lycanList, lycanLocked, lycanPages } from './Parsing'
import { lycanDetails } from './Details'
import { lycanChapterSeries, lycanReaderChapters } from './Chapters'
import { lycanSections, lycanHighlights } from './Browsing'
import { isLycanGenre, lycanGenres } from './Genres'

const lycanHeaders = { Accept: 'application/json,text/html;q=0.9,*/*;q=0.8', Referer: LYCAN_BASE + '/' }

export const LycanToonsInfo: SourceInfo = {
  name: 'LycanToons', version: '0.2.6', icon: 'lycantoons.png', author: 'Lorenzo',
  description: 'Portuguese manga and webtoons from LycanToons', websiteBaseURL: LYCAN_BASE,
  contentRating: ContentRating.MATURE, sourceTags: [],
  intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}
export class LycanToons extends Source {
  private readonly discovery = new DiscoveryCache<DiscoveryPage>()
  private readonly genres = new GenreCache(LYCAN_BASE)
  private readonly chapters = new DiscoveryCache<LycanChapter[]>()
  private readonly documents = new DiscoveryCache<string>()
  requestManager = App.createRequestManager({
    requestsPerSecond: 4, requestTimeout: 25000,
    interceptor: {
      interceptRequest: async (request: Request): Promise<Request> => {
        request.headers = { ...(request.headers || {}), ...await this.requestHeaders() }
        return request
      },
      interceptResponse: async (response: Response): Promise<Response> => response
    }
  })
  private async requestHeaders(): Promise<Record<string, string>> {
    return { ...lycanHeaders, 'user-agent': await this.requestManager.getDefaultUserAgent() }
  }
  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return App.createRequest({ url: LYCAN_BASE, method: 'GET', headers: await this.requestHeaders() })
  }

  private async request(path: string, body?: Record<string, unknown>): Promise<string> {
    const url = sourceDocumentUrl(path, LYCAN_BASE)
    const response = await this.requestManager.schedule(App.createRequest({ url, method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined, data: body ? JSON.stringify(body) : undefined }), 1)
    const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '')
    assertReadableDocument(this.cheerio, html, response.status, url, response.headers)
    return html
  }
  private async api(path: string, body?: Record<string, unknown>): Promise<unknown> {
    const data = await this.request(path, body)
    try { return JSON.parse(data) as unknown } catch (_) { throw new Error(`LycanToons returned invalid JSON at ${path}`) }
  }
  private async catalog(page: number, parameters: Record<string, unknown> = {}, previousIds?: string[]): Promise<DiscoveryPage> {
    return lycanList(await this.api('/api/series', { page, limit: 12, ...parameters }), page, previousIds)
  }
  async getSearchResults(query: SearchRequest, metadata: { page?: number; previousIds?: string[]; query?: SearchRequest } | undefined): Promise<PagedResults> {
    query = metadata?.query ?? query
    const page = Math.max(1, Math.floor(Number(metadata?.page) || 1))
    if (query.excludedTags?.length) throw new Error('LycanToons does not support excluded genres')
    const tags = (query.includedTags || []).map(tag => tag.id)
    if (tags.some(tag => !isLycanGenre(tag) || tag.length > 120)) throw new Error('Invalid LycanToons genre selection')
    const result = createDiscoveryPage(await this.catalog(page, { search: normalizeText(query.title), ...(tags.length ? { tags } : {}) }, metadata?.previousIds))
    if (result.metadata) result.metadata = { ...result.metadata, query }
    return result
  }
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const { genres, ...details } = lycanDetails(this.cheerio, await this.seriesDocument(mangaId), mangaId)
    const tags = genres.length ? [App.createTagSection({ id: 'genres', label: 'Gêneros', tags: genres.map(genre => App.createTag(genre)) })] : []
    return App.createSourceManga({ id: mangaId, mangaInfo: App.createMangaInfo({ ...details, tags }) })
  }
  private seriesDocument(mangaId: string): Promise<string> {
    const path = `/series/${lycanSlug(mangaId)}`
    return this.documents.load(path, () => this.request(path))
  }
  private loadChapters(mangaId: string): Promise<LycanChapter[]> {
    const slug = lycanSlug(mangaId)
    return this.chapters.load(slug, async () => {
      const series = lycanChapterSeries(this.cheerio, await this.seriesDocument(mangaId), mangaId)
      if (!series.total) return []
      return lycanReaderChapters(this.cheerio, await this.request(`/series/${slug}/${series.first}`), series)
    })
  }
  async getChapters(mangaId: string): Promise<Chapter[]> {
    const path = `/series/${lycanSlug(mangaId)}`
    return (await this.loadChapters(mangaId)).filter(chapter => !lycanLocked(chapter)).map(chapter => App.createChapter({
      id: `${path}/${chapter.number}`, chapNum: chapter.number,
      name: [`Capítulo ${chapter.number}`, chapter.title].filter(Boolean).join(': '), langCode: 'pt', time: new Date(chapter.createdAt)
    }))
  }
  async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
    const path = `/series/${lycanSlug(mangaId)}`
    const chapters = await this.loadChapters(mangaId)
    const chapter = chapters.find(chapter => chapterId === `${path}/${chapter.number}`)
    if (!chapter) throw new Error('LycanToons chapter does not belong to this manga. Refresh its chapter list.')
    if (lycanLocked(chapter)) throw new Error('This LycanToons chapter is still reserved for VIP readers')
    const pages = lycanPages(await this.api(`/api/chapters/${chapter.id}/view-pages`), chapter)
    return App.createChapterDetails({ id: chapterId, mangaId, pages })
  }
  async getHomePageSections(callback: (section: HomeSection) => void): Promise<void> {
    return loadDiscoverySections(lycanSections, callback,
      () => this.genres.prepare(() => this.fetchGenres()),
      id => this.discoveryPage(id, 1))
  }
  async getViewMoreItems(id: string, metadata: { page?: number; previousIds?: string[] } | undefined): Promise<PagedResults> {
    const page = Math.max(1, Math.floor(Number(metadata?.page) || 1))
    return createDiscoveryPage(await this.discoveryPage(id, page, metadata?.previousIds))
  }
  private async discoveryPage(id: string, page: number, previousIds?: string[]): Promise<DiscoveryPage> {
    const section = lycanSections.find(section => section.id === id)
    if (!section) throw new Error('Unknown LycanToons home section')
    const load = async () => id === 'highlights' ? lycanHighlights(await this.api('/api/get-highlights?limit=6')) : this.catalog(page, section.parameters, previousIds)
    return page === 1 ? this.discovery.load(id, load) : load()
  }
  async getSearchTags() {
    const genres = (await this.genres.load(() => this.fetchGenres())).filter(genre => isLycanGenre(genre.id) && isLycanGenre(genre.label))
    return [App.createTagSection({ id: 'genres', label: 'Gêneros', tags: genres.map(genre => App.createTag(genre)) })]
  }
  async supportsTagExclusion(): Promise<boolean> { return false }
  private async fetchGenres() { return lycanGenres(await this.api('/api/genres')) }
  getMangaShareUrl(mangaId: string): string { return sourceDocumentUrl(`/series/${lycanSlug(mangaId)}`, LYCAN_BASE) }
}
