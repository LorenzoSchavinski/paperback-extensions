import { SourceInfo, SourceIntents, ContentRating, SearchRequest, PagedResults, Chapter, HomeSection } from '@paperback/types'
import { HtmlSource } from '../shared/HtmlSource'
import { SiteConfig } from '../shared/Config'
import { normalizeText } from '../shared/Urls'
import { assertMgekoCatalog, parseMgekoChapters } from './Parsing'
import { mgekoSections, mgekoBrowsePage, mgekoGenres } from './Browsing'
import { DiscoveryCache } from '../shared/discovery/Cache'
import { GenreCache } from '../shared/discovery/Genres'
import { DiscoveryPage, createDiscoveryPage } from '../shared/discovery/Page'
import { loadDiscoverySections } from '../shared/discovery/Sections'

export const MgekoInfo: SourceInfo = {
  name: 'Mgeko', version: '0.3.8', icon: 'mgeko.png', author: 'Lorenzo',
  description: 'Self-owned Mgeko source', websiteBaseURL: 'https://www.mgeko.cc',
  contentRating: ContentRating.MATURE, sourceTags: [],
  intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}
const config: SiteConfig = {
  base: 'https://www.mgeko.cc',
  cards: '.chapters .novel-item a.list-body, .results-wrapper .novel-item a',
  mangaPath: /^\/manga\/[^/]+$/i,
  chapters: '.chapter-list a[href*="/reader/en/"]',
  chapterPath: /^\/reader\/en\/[^/]+$/i,
  reader: '#chapter-reader img',
  cover: '.fixed-img img',
  description: '.description'
}
export class Mgeko extends HtmlSource {
  protected config = config
  private readonly discovery = new DiscoveryCache<DiscoveryPage>()
  private readonly genres = new GenreCache(config.base)

  async getSearchResults(query: SearchRequest, metadata: { page?: number; previousIds?: string[]; query?: SearchRequest } | undefined): Promise<PagedResults> {
    query = metadata?.query ?? query
    const title = normalizeText(query?.title)
    const page = Math.max(1, Math.min(1000, Math.floor(Number(metadata?.page) || 1)))
    if (!title || query.includedTags?.length || query.excludedTags?.length) {
      const results = await this.browseCatalog('latest', page, title, query, metadata?.previousIds)
      if (results.metadata) results.metadata = { ...results.metadata, query }
      return results
    }
    const { body, url } = await this.getHtml(`/autocomplete?term=${encodeURIComponent(title)}`)
    const results = this.parseCards(body, url)
    assertMgekoCatalog(this.cheerio, body, results.length, url)
    return App.createPagedResults({ results, metadata: undefined })
  }

  async getHomePageSections(callback: (section: HomeSection) => void): Promise<void> {
    return loadDiscoverySections(mgekoSections.map(section => ({ ...section, containsMoreItems: true })), callback,
      () => this.genres.prepare(() => this.fetchGenres()),
      id => {
        const section = mgekoSections.find(section => section.id === id)!
        return this.discovery.load(section.sort, () => this.browsePage(section.sort, 1))
      })
  }

  async getViewMoreItems(id: string, metadata: { page?: number; previousIds?: string[]; query?: SearchRequest } | undefined): Promise<PagedResults> {
    const section = mgekoSections.find(section => section.id === id)
    if (!section) throw new Error('Unknown Mgeko home section')
    if (id === 'browse' && metadata?.query) return this.getSearchResults(metadata.query, metadata)
    const page = Math.max(1, Math.min(1000, Math.floor(Number(metadata?.page) || 1)))
    if (page > 1) return this.browseCatalog(section.sort, page, '', undefined, metadata?.previousIds)
    return createDiscoveryPage(await this.discovery.load(section.sort, () => this.browsePage(section.sort, 1)))
  }

  private async browseCatalog(sort: string, page: number, title = '', query?: SearchRequest, previousIds?: string[]): Promise<PagedResults> {
    return createDiscoveryPage(await this.browsePage(sort, page, title, query, previousIds))
  }

  private async browsePage(sort: string, page: number, title = '', query?: SearchRequest, previousIds?: string[]): Promise<DiscoveryPage> {
    const parameters: Record<string, string> = { sort, page: String(page) }
    if (title) parameters.q = title
    if (query?.includedTags?.length) parameters.include_genres = query.includedTags.map(tag => tag.id).join(',')
    if (query?.excludedTags?.length) parameters.exclude_genres = query.excludedTags.map(tag => tag.id).join(',')
    const path = '/browse-comics/data/?' + Object.entries(parameters).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
    const { body } = await this.getHtml(path)
    let data: unknown
    try { data = JSON.parse(body) } catch (_) { throw new Error('Mgeko returned invalid browse JSON') }
    return mgekoBrowsePage(this.cheerio, data, page, previousIds)
  }

  async getSearchTags() {
    const genres = await this.loadGenres()
    return [App.createTagSection({ id: 'genres', label: 'Genres', tags: genres.map(tag => App.createTag(tag)) })]
  }

  private loadGenres() {
    return this.genres.load(() => this.fetchGenres())
  }

  private async fetchGenres() { return mgekoGenres(this.cheerio, (await this.getHtml('/browse-comics/')).body) }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const { body, url } = await this.getHtml(`${mangaId.replace(/\/$/, '')}/all-chapters/`)
    const chapters = parseMgekoChapters(this.cheerio, body, url)
    if (!chapters.length) throw new Error(`No Mgeko chapter list found at ${url}`)
    return chapters.map(chapter => App.createChapter({ ...chapter, langCode: 'en' }))
  }
}
