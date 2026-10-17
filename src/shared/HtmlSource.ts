import {
  Source, SourceManga, Chapter, ChapterDetails, 
  Request, Response
} from '@paperback/types'
import { SiteConfig } from './Config'
import { absoluteUrl, normalizeText, sourceDocumentUrl } from './Urls'
import { assertReadableDocument } from './html/Document'
import { imageUrl } from './html/Images'
import { mangaCards } from './html/Catalog'
import { chapterLinks, HtmlChapter } from './html/Chapters'
import { nextDocumentPage } from './html/Pagination'
import { readerPages } from './html/Reader'

/** Requests go directly from Paperback to each source website. */
export abstract class HtmlSource extends Source {
  protected abstract config: SiteConfig
  requestManager = App.createRequestManager({
    requestsPerSecond: 6,
    requestTimeout: 25000,
    interceptor: {
      interceptRequest: async (request: Request): Promise<Request> => {
        request.headers = {
          ...(request.headers || {}),
          'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Referer': this.config.base + '/',
        }
        return request
      },
      interceptResponse: async (response: Response): Promise<Response> => response
    }
  })

  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return App.createRequest({url: this.config.base, method: 'GET'})
  }

  protected async getHtml(pathOrUrl: string): Promise<{ body: string; url: string }> {
    const url = sourceDocumentUrl(pathOrUrl, this.config.base)
    const response = await this.requestManager.schedule(App.createRequest({ url, method: 'GET' }), 1)
    const body = typeof response.data === 'string' ? response.data : String(response.data ?? '')
    assertReadableDocument(this.cheerio, body, response.status, url, response.headers)
    return { body, url }
  }

  protected parseCards(html: string, pageUrl: string) {
    return mangaCards(this.cheerio, html, pageUrl, this.config).map(card => App.createPartialSourceManga(card))
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const {body, url} = await this.getHtml(mangaId)
    const $ = this.cheerio.load(body)
    const title = normalizeText($('h1').first().text() || $('meta[property="og:title"]').attr('content') || $('title').first().text())
    if (!title) throw new Error(`Could not parse manga title for ${url}`)
    const image = absoluteUrl($('meta[property="og:image"]').attr('content'), url) || imageUrl($(this.config.cover).first(), url)
    const desc = normalizeText($(this.config.description).first().text() || $('meta[name="description"]').attr('content'))
    return App.createSourceManga({
      id: mangaId,
      mangaInfo: App.createMangaInfo({titles: [title], image, desc, status: 'UNKNOWN', tags: []})
    })
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    let path: string | undefined = mangaId
    const visited = new Set<string>()
    const found = new Map<string, HtmlChapter>()
    while (path) {
      const {body, url} = await this.getHtml(path)
      if (visited.has(url) || visited.size >= 250) throw new Error(`Chapter pagination did not finish at ${url}`)
      visited.add(url)
      const pageChapters = chapterLinks(this.cheerio, body, url, this.config)
      if (!pageChapters.length) throw new Error(`No chapter links found at ${url}. The website may require a site-specific API.`)
      const before = found.size
      for (const chapter of pageChapters) if (!found.has(chapter.id)) found.set(chapter.id, chapter)
      if (visited.size > 1 && found.size === before) throw new Error(`Website repeated a chapter list at ${url}. Pagination needs an update.`)
      path = nextDocumentPage(this.cheerio, body, url, this.config.base)
    }
    return [...found.values()].sort((a, b) => b.chapNum - a.chapNum)
      .map(chapter => App.createChapter({...chapter, langCode: 'en'}))
  }

  async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
    const {body, url} = await this.getHtml(chapterId)
    const pages = readerPages(this.cheerio, body, url, this.config)
    if (!pages.length) throw new Error(`No reader page images detected: ${url}. Reader may require a site-specific API.`)
    return App.createChapterDetails({ id: chapterId, mangaId, pages })
  }

  getMangaShareUrl(mangaId: string): string { return sourceDocumentUrl(mangaId, this.config.base) }
}
