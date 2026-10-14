import type { CheerioAPI } from 'cheerio'
import { absoluteUrl, normalizeText, pageId, sameOrigin } from '../Urls'

/** Follow only a same document next link. Buttons require a site adapter. */
export function nextDocumentPage(cheerio: CheerioAPI, html: string, url: string, base: string): string | undefined {
  const $ = cheerio.load(html, {scriptingEnabled: false})
  let next: string | undefined
  const current = Number(/(?:[?&])page=(\d+)/i.exec(url)?.[1] || 1)
  $('a[href]').each((_, element) => {
    if (next) return
    const link = $(element)
    const label = normalizeText(link.attr('aria-label') || link.text())
    const target = absoluteUrl(link.attr('href'), url)
    if (!target || target === url || !sameOrigin(target, base) || pageId(target, base) !== pageId(url, base)) return
    const page = Number(/(?:[?&])page=(\d+)/i.exec(target)?.[1])
    const explicitNext = /(?:^|\s)next(?:\s|$)/i.test(link.attr('rel') || '') || /^next(?: page)?\b/i.test(label)
    if ((explicitNext && (!page || page > current)) || page === current + 1) next = target
  })
  return next
}
