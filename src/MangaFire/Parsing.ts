import type { CheerioAPI } from 'cheerio'
import { absoluteUrl, isProbablePageImage, normalizeText, pageId, sourceDocumentUrl } from '../shared/Urls'

export const MANGAFIRE_BASE = 'https://mangafire.to'
type Data = Record<string, unknown>
function object(value: unknown, label: string): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid MangaFire ${label}`)
  return value as Data
}
function text(value: unknown): string { return typeof value === 'string' ? normalizeText(value) : '' }
function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`Invalid MangaFire ${label}`)
  return value
}
function integer(value: unknown, label: string, minimum = 0): number {
  const result = number(value, label)
  if (!Number.isSafeInteger(result) || result < minimum) throw new Error(`Invalid MangaFire ${label}`)
  return result
}
function image(value: unknown, size: 'large' | 'medium'): string {
  const poster = object(value, 'cover')
  const url = absoluteUrl(text(poster[size]), MANGAFIRE_BASE)
  if (!url) throw new Error('Missing MangaFire cover URL')
  return url
}
export function mangaFireHid(mangaId: string): string {
  const path = pageId(sourceDocumentUrl(mangaId, MANGAFIRE_BASE), MANGAFIRE_BASE)
  const current = /^\/title\/([a-z0-9]+)(?:-[^/]+)?$/i.exec(path)
  const legacy = /^\/manga\/[^/]+\.([a-z0-9]+)$/i.exec(path)
  const hid = current?.[1] || legacy?.[1]
  if (!hid) throw new Error('Invalid MangaFire manga ID. Refresh this manga in the source.')
  return hid
}
export function mangaFireChapterId(chapterId: string): string {
  const path = pageId(sourceDocumentUrl(chapterId, MANGAFIRE_BASE), MANGAFIRE_BASE)
  const match = /^\/title\/[^/]+\/chapter\/(\d+)$/i.exec(path)
  if (!match) throw new Error('Invalid MangaFire chapter ID. Refresh the manga chapter list.')
  return match[1]
}
export function mangaFireList(value: unknown) {
  const data = object(value, 'list response')
  if (!Array.isArray(data.items)) throw new Error('Missing MangaFire list items')
  const meta = object(data.meta, 'pagination')
  if (typeof meta.hasNext !== 'boolean') throw new Error('Missing MangaFire pagination state')
  const page = integer(meta.page, 'page number', 1)
  const lastPage = integer(meta.lastPage, 'last page number', 1)
  if (meta.hasNext !== (page < lastPage)) throw new Error('Inconsistent MangaFire pagination state')
  return { items: data.items, page, lastPage, total: integer(meta.total, 'total count'), hasNext: meta.hasNext }
}
export function mangaFireCard(value: unknown) {
  const item = object(value, 'catalog item')
  const title = text(item.title)
  const mangaId = pageId(sourceDocumentUrl(text(item.url), MANGAFIRE_BASE), MANGAFIRE_BASE)
  mangaFireHid(mangaId)
  if (!title) throw new Error('Missing MangaFire manga title')
  return { mangaId, title, image: image(item.poster, 'medium') }
}
export function mangaFireDetails(cheerio: CheerioAPI, value: unknown, mangaId: string) {
  const data = object(object(value, 'details response').data, 'manga details')
  if (text(data.hid) !== mangaFireHid(mangaId)) throw new Error('MangaFire returned details for a different manga')
  const title = text(data.title)
  if (!title) throw new Error('Missing MangaFire manga title')
  const names = (items: unknown): string => Array.isArray(items) ? items.map(item => text(object(item, 'creator').title)).filter(Boolean).join(', ') : ''
  const titles = [title, ...(Array.isArray(data.altTitles) ? data.altTitles.map(text).filter(Boolean) : [])]
  const $ = cheerio.load(typeof data.synopsisHtml === 'string' ? data.synopsisHtml : '')
  const states: Record<string, string> = { releasing: 'ONGOING', completed: 'COMPLETED', finished: 'COMPLETED', on_hiatus: 'HIATUS', discontinued: 'DISCONTINUED' }
  const genres = Array.isArray(data.genres) ? data.genres.map(item => {
    const genre = object(item, 'genre')
    return { id: String(integer(genre.id, 'genre ID', 1)), label: text(genre.title) }
  }).filter(genre => genre.label) : []
  return { titles: [...new Set(titles)], image: image(data.poster, 'large'), desc: normalizeText($.text()), status: states[text(data.status)] || 'UNKNOWN', author: names(data.authors), artist: names(data.artists), genres }
}
export function mangaFireChapter(value: unknown, mangaId: string) {
  const item = object(value, 'chapter')
  const id = integer(item.id, 'chapter ID', 1)
  const chapNum = number(item.number, 'chapter number')
  if (text(item.language) !== 'en') throw new Error('MangaFire returned a chapter in an unexpected language')
  const name = [`Chapter ${chapNum}`, text(item.name)].filter(Boolean).join(': ')
  return { id: `/title/${mangaFireHid(mangaId)}/chapter/${id}`, chapNum, name, langCode: 'en', group: text(item.type), time: new Date(number(item.createdAt, 'chapter timestamp') * 1000) }
}
export function mangaFirePages(value: unknown, mangaId: string, chapterId: string): string[] {
  const data = object(object(value, 'reader response').data, 'reader')
  if (String(number(data.id, 'reader chapter ID')) !== mangaFireChapterId(chapterId)) throw new Error('MangaFire returned a different chapter')
  if (text(object(data.title, 'reader title').hid) !== mangaFireHid(mangaId)) throw new Error('MangaFire returned pages for a different manga')
  if (!Array.isArray(data.pages) || !data.pages.length) throw new Error('MangaFire returned no reader pages')
  const pages = data.pages.map(page => {
    const url = absoluteUrl(text(object(page, 'reader page').url), MANGAFIRE_BASE)
    if (!isProbablePageImage(url, true)) throw new Error('MangaFire returned an invalid reader image URL')
    return url
  })
  return [...new Set(pages)]
}
