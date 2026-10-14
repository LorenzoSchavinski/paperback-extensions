import type { CheerioAPI } from 'cheerio'
import { absoluteUrl, normalizeText, pageId } from '../shared/Urls'

export const mgekoSections = [
  { id: 'browse', title: 'Latest updates', sort: 'latest' },
  { id: 'new', title: 'Recently added', sort: 'recently_added' },
  { id: 'daily', title: 'Popular today', sort: 'popular_daily' },
  { id: 'weekly', title: 'Popular this week', sort: 'popular_weekly' },
  { id: 'monthly', title: 'Popular this month', sort: 'popular_monthly' },
  { id: 'alltime', title: 'Popular all time', sort: 'popular_all_time' }
] as const

export function mgekoBrowsePage(cheerio: CheerioAPI, value: unknown, requestedPage: number, previousIds?: string[]) {
  const data = value as { results_html?: string; page?: number; num_pages?: number; total_results?: number }
  if (!data || typeof data.results_html !== 'string' || data.page !== requestedPage ||
    !Number.isInteger(data.num_pages) || data.num_pages! < requestedPage || !Number.isInteger(data.total_results) || data.total_results! < 0) {
    throw new Error('Invalid Mgeko browse pagination')
  }
  const $ = cheerio.load(data.results_html)
  const results = $('.comic-card').map((_, element) => {
    const card = $(element), link = card.find('.comic-card__title a').first()
    const url = absoluteUrl(link.attr('href'), 'https://www.mgeko.cc')
    const mangaId = pageId(url, 'https://www.mgeko.cc')
    const title = normalizeText(link.text())
    const image = absoluteUrl(card.find('.comic-card__cover img').attr('src'), 'https://www.mgeko.cc')
    if (!url.startsWith('https://www.mgeko.cc/manga/') || !/^\/manga\/[^/]+$/.test(mangaId) || !title || !image) throw new Error('Invalid Mgeko browse card')
    return { mangaId, title, image }
  }).get()
  if (!results.length && data.total_results! > 0) throw new Error('Mgeko returned an incomplete catalog')
  const ids = results.map(item => item.mangaId)
  if (requestedPage > 1 && previousIds?.length === ids.length && ids.every((id, index) => id === previousIds[index])) {
    throw new Error('Mgeko repeated the previous catalog page')
  }
  return { results, metadata: requestedPage < data.num_pages! ? { page: requestedPage + 1, previousIds: ids } : undefined }
}

export function mgekoGenres(cheerio: CheerioAPI, html: string) {
  const $ = cheerio.load(html)
  const tags = $('[data-group="include_genres"][data-value]').map((_, element) => {
    const id = normalizeText($(element).attr('data-value'))
    if (!id) throw new Error('Invalid Mgeko genre filter')
    return { id, label: id }
  }).get()
  if (!tags.length) throw new Error('Mgeko genre filters were not found')
  return tags
}
