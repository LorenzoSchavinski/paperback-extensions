import type { CheerioAPI } from 'cheerio'
import { absoluteUrl, chapterNumber, normalizeText, pageId, sameOrigin } from '../shared/Urls'

const base = 'https://www.mgeko.cc'

/** Autocomplete explicitly returns a standalone status instead of an empty list. */
export function assertMgekoCatalog(cheerio: CheerioAPI, html: string, count: number, url: string): void {
  if (count) return
  const $ = cheerio.load(html)
  $('script,style').remove()
  if ($('body').children().length === 1 && $('body > div').length === 1 &&
    normalizeText($('body').text()) === 'Nothing was found.') return
  throw new Error(`No manga cards found at ${url}. The Mgeko layout or search route has changed.`)
}

export function parseMgekoChapters(cheerio: CheerioAPI, html: string, pageUrl: string) {
  const $ = cheerio.load(html)
  const chapters = new Map<string, { id: string; name: string; chapNum: number }>()
  $('.chapter-list a[href]').each((_, element) => {
    const link = $(element)
    const href = absoluteUrl(link.attr('href'), pageUrl)
    if (!sameOrigin(href, base)) return
    const id = pageId(href, base)
    if (!/^\/reader\/en\/[^/]+$/i.test(id) || chapters.has(id)) return
    // Link titles contain the entire series slug and link text also includes dates.
    const label = normalizeText(link.find('.chapter-title').first().text())
    if (!label) return
    const number = /^(\d+(?:[.-]\d+)?)(?:-eng-li)?$/i.exec(label)
    const chapNum = number ? Number(number[1].replace('-', '.')) : chapterNumber(label) || chapterNumber(id)
    const name = number ? `Chapter ${number[1].replace('-', '.')}` : label
    chapters.set(id, { id, name, chapNum })
  })
  return [...chapters.values()].sort((a, b) => b.chapNum - a.chapNum)
}
