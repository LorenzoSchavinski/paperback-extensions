import type { CheerioAPI } from 'cheerio'
import { SiteConfig } from '../Config'
import { absoluteUrl, chapterNumber, normalizeText, pageId, sameOrigin } from '../Urls'

export interface HtmlChapter { id: string; name: string; chapNum: number }

export function chapterLinks(cheerio: CheerioAPI, html: string, url: string, config: SiteConfig): HtmlChapter[] {
  const $ = cheerio.load(html)
  const chapters = new Map<string, HtmlChapter>()
  $(config.chapters).each((_, element) => {
    const node = $(element)
    const link = node.is('a[href]') ? node : node.closest('a[href]')
    const resolved = absoluteUrl(link.attr('href'), url)
    if (!sameOrigin(resolved, config.base)) return
    const id = pageId(resolved, config.base)
    if (!config.chapterPath.test(id) || chapters.has(id)) return
    const content = (config.chapterName ? link.find(config.chapterName).first() : link).clone()
    content.find('script,style').remove()
    content.find('span,div,p,br').append(' ')
    const name = normalizeText(link.attr('title') || content.text())
    if (!name) return
    chapters.set(id, { id, name, chapNum: chapterNumber(id) ?? chapterNumber(name) ?? 0 })
  })
  return [...chapters.values()]
}
