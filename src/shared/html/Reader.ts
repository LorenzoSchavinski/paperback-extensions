import type { CheerioAPI } from 'cheerio'
import { SiteConfig } from '../Config'
import { imageUrl } from './Images'

export function readerPages(cheerio: CheerioAPI, html: string, url: string, config: SiteConfig): string[] {
  const $ = cheerio.load(html)
  const images = $(config.reader).map((_, element) => {
    const item = $(element)
    if (config.readerMustHaveAltPage && !/page\s*\d+/i.test(item.attr('alt') || '')) return undefined
    const index = item.attr('data-page-index')
    return { url: imageUrl(item, url, true, true), index: index !== undefined && /^\d+$/.test(index) ? Number(index) : undefined }
  }).get().filter(image => image.url)
  if (images.length && images.every(image => image.index !== undefined)) images.sort((a, b) => a.index! - b.index!)
  return images.map(image => image.url)
}
