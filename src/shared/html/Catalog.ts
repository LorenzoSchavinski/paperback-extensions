import type { CheerioAPI } from 'cheerio'
import { SiteConfig } from '../Config'
import { absoluteUrl, normalizeText, pageId, sameOrigin } from '../Urls'
import { imageUrl } from './Images'

export interface MangaCard { mangaId: string; title: string; image: string }

export function mangaCards(cheerio: CheerioAPI, html: string, pageUrl: string, config: SiteConfig): MangaCard[] {
  const $ = cheerio.load(html, {scriptingEnabled: false})
  const results = new Map<string, MangaCard>()
  $(config.cards).each((_, element) => {
    const tile = $(element)
    const link = tile.is('a[href]') ? tile : tile.find('a[href]').first()
    const resolved = absoluteUrl(link.attr('href'), pageUrl)
    if (!sameOrigin(resolved, config.base)) return
    const mangaId = pageId(resolved, config.base)
    if (!config.mangaPath.test(mangaId)) return
    const image = tile.is('img') ? tile : tile.find('img').first()
    const title = normalizeText(tile.find('h2,h3,h4,.title,.name,.series-title').first().text() ||
      link.attr('title') || image.attr('alt') || link.find('[title]').first().attr('title') || link.text())
    if (!title || title.length > 220) return
    const card = { mangaId, title, image: imageUrl(image, pageUrl) }
    const previous = results.get(mangaId)
    if (!previous || (!previous.image && card.image)) results.set(mangaId, card)
  })
  return [...results.values()]
}

/** A blank search is valid only when the website explicitly reports no matches. */
export function assertCatalogResults(cheerio: CheerioAPI, html: string, count: number, url: string, config: SiteConfig): void {
  if (count) return
  const $ = cheerio.load(html, {scriptingEnabled: false})
  $('script,style').remove()
  const status = $(config.emptyResults || 'main h1,main h2,main h3').text()
  if (/\b(?:no (?:results|series|manga|matches|comics)(?: (?:were )?found)?|nothing found)\b/i.test(status)) return
  throw new Error(`No manga cards found at ${url}. The website layout or search route has changed.`)
}
