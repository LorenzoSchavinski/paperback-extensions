import { Source, SourceInfo, SourceIntents, ContentRating, Request, Response, SearchRequest, PagedResults, SourceManga, Chapter, ChapterDetails, HomeSection, TagSection } from '@paperback/types'
import { normalizeText, sourceDocumentUrl } from '../shared/Urls'
import { assertReadableDocument } from '../shared/html/Document'
import { DiscoveryCache } from '../shared/discovery/Cache'
import { GenreCache } from '../shared/discovery/Genres'
import { DiscoveryPage, createDiscoveryPage } from '../shared/discovery/Page'
import { loadDiscoverySections } from '../shared/discovery/Sections'
import { nexusDecoded } from './Decoding'
import { NEXUS_BASE, nexusSlug, nexusList, nexusManga, nexusChapterId, nexusPages, nexusRanking, nexusGenres } from './Parsing'
import { nexusSections, nexusFilters, nexusTagSections } from './Browsing'

export const NexusToonsInfo: SourceInfo = {
  name: 'NexusToons', version: '0.2.2', icon: 'nexustoons.png', author: 'Lorenzo',
  description: 'Portuguese manga and webtoons from NexusToons', websiteBaseURL: NEXUS_BASE,
  contentRating: ContentRating.MATURE, sourceTags: [],
  intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS
}
interface Metadata { page?: number; previousIds?: string[]; title?: string; categories?: string[] }
export class NexusToons extends Source {
  private readonly discovery = new DiscoveryCache<DiscoveryPage>()
  private readonly manga = new DiscoveryCache<ReturnType<typeof nexusManga>>()
  private readonly genres = new GenreCache(NEXUS_BASE)
  requestManager = App.createRequestManager({
    requestsPerSecond: 4, requestTimeout: 25000,
    interceptor: {
      interceptRequest: async (request: Request): Promise<Request> => {
        request.headers = { ...(request.headers || {}), Accept: 'application/json', Referer: NEXUS_BASE + '/' }
        return request
      },
      interceptResponse: async (response: Response): Promise<Response> => response
    }
  })
  private async api(path: string): Promise<unknown> {
    const url = sourceDocumentUrl(path, NEXUS_BASE)
    const response = await this.requestManager.schedule(App.createRequest({ url, method: 'GET' }), 1)
    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '')
    assertReadableDocument(this.cheerio, body, response.status, url, response.headers)
    let value: unknown
    try { value = JSON.parse(body) as unknown } catch (_) { throw new Error(`NexusToons returned invalid JSON at ${path}`) }
    return nexusDecoded(value)
  }
  private async catalog(page: number, metadata: Metadata = {}, sort = 'lastChapterAt'): Promise<DiscoveryPage> {
    const query = [`page=${page}`, 'limit=12', `sortBy=${sort}`, 'categoryMode=and',
      metadata.title ? 'search=' + encodeURIComponent(metadata.title) : '', ...nexusFilters(metadata.categories || [])].filter(Boolean)
    return nexusList(await this.api('/api/mangas?' + query.join('&')), page, metadata.previousIds)
  }
  async getSearchResults(query: SearchRequest, metadata: Metadata | undefined): Promise<PagedResults> {
    if (query.excludedTags?.length) throw new Error('NexusToons does not support excluded categories. Use included categories instead.')
    const page = Math.max(1, Math.min(10000, Math.floor(Number(metadata?.page) || 1)))
    const title = metadata?.title ?? normalizeText(query.title)
    const categories = metadata?.categories ?? (query.includedTags || []).map(tag => tag.id)
    const result = createDiscoveryPage(await this.catalog(page, { ...metadata, title, categories }))
    if (result.metadata) result.metadata = { ...result.metadata, title, categories }
    return result
  }
  async getSearchTags(): Promise<TagSection[]> {
    return nexusTagSections(await this.genres.load(() => this.fetchGenres()))
  }
  async supportsTagExclusion(): Promise<boolean> { return false }
  private async fetchGenres() { return nexusGenres(await this.api('/api/categories')) }
  private loadManga(mangaId: string) {
    const slug = nexusSlug(mangaId)
    return this.manga.load(slug, async () => nexusManga(await this.api(`/api/manga/${encodeURIComponent(slug)}`), mangaId))
  }
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const { id, chapters, genres, ...details } = await this.loadManga(mangaId)
    const tags = nexusTagSections(genres)
    return App.createSourceManga({ id: mangaId, mangaInfo: App.createMangaInfo({ ...details, tags }) })
  }
  async getChapters(mangaId: string): Promise<Chapter[]> {
    const slug = encodeURIComponent(nexusSlug(mangaId))
    const manga = await this.loadManga(mangaId)
    return manga.chapters.filter(chapter => chapter.available).map(chapter => App.createChapter({
      id: `/ler/${slug}/${chapter.id}`, chapNum: chapter.number, langCode: 'pt',
      name: [`Capítulo ${chapter.number}`, chapter.title].filter(Boolean).join(': '), time: new Date(chapter.createdAt)
    }))
  }
  async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
    const id = nexusChapterId(chapterId, mangaId)
    const manga = await this.loadManga(mangaId)
    const chapter = manga.chapters.find(chapter => chapter.id === id)
    if (!chapter) throw new Error('NexusToons chapter does not belong to this manga. Refresh its chapter list.')
    if (!chapter.available) throw new Error('This NexusToons chapter is not publicly available')
    const pages = nexusPages(await this.api(`/api/chapter/${id}`), manga, chapter)
    return App.createChapterDetails({ id: chapterId, mangaId, pages })
  }
  async getHomePageSections(callback: (section: HomeSection) => void): Promise<void> {
    return loadDiscoverySections(nexusSections, callback,
      () => this.genres.prepare(() => this.fetchGenres()),
      id => this.discoveryPage(id, 1))
  }
  async getViewMoreItems(id: string, metadata: Metadata | undefined): Promise<PagedResults> {
    const page = Math.max(1, Math.min(10000, Math.floor(Number(metadata?.page) || 1)))
    return createDiscoveryPage(await this.discoveryPage(id, page, metadata?.previousIds))
  }
  private async discoveryPage(id: string, page: number, previousIds?: string[]): Promise<DiscoveryPage> {
    const section = nexusSections.find(section => section.id === id)
    if (!section) throw new Error('Unknown NexusToons home section')
    if (section.path && page > 1) throw new Error('This NexusToons ranking has no additional pages')
    const load = async () => section.path ? nexusRanking(await this.api(section.path)) : this.catalog(page, { previousIds }, section.sort)
    return page === 1 ? this.discovery.load(id, load) : load()
  }
  getMangaShareUrl(mangaId: string): string { return sourceDocumentUrl(`/manga/${encodeURIComponent(nexusSlug(mangaId))}`, NEXUS_BASE) }
}
