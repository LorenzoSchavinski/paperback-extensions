import { absoluteUrl, isProbablePageImage, normalizeText, pageId, sourceDocumentUrl } from '../shared/Urls'

export const LYCAN_BASE = 'https://lycantoons.com'
type Data = Record<string, unknown>
function object(value: unknown): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid LycanToons response')
  return value as Data
}
function text(value: unknown): string { return typeof value === 'string' ? normalizeText(value) : '' }
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid LycanToons number')
  return value
}
function integer(value: unknown): number {
  const result = number(value)
  if (!Number.isSafeInteger(result)) throw new Error('Invalid LycanToons count or ID')
  return result
}
function image(value: unknown): string {
  const url = absoluteUrl(text(value), LYCAN_BASE)
  if (!url) throw new Error('Missing LycanToons image URL')
  return url
}
export function lycanSlug(mangaId: string): string {
  const path = pageId(sourceDocumentUrl(mangaId, LYCAN_BASE), LYCAN_BASE)
  const match = /^\/series\/([^/]+)$/.exec(path)
  if (!match) throw new Error('Invalid LycanToons manga ID')
  return match[1]
}
export function lycanCard(value: unknown) {
  const item = object(value)
  const mangaId = `/series/${text(item.slug)}`
  lycanSlug(mangaId)
  const title = text(item.title)
  if (!title) throw new Error('Missing LycanToons title')
  return { mangaId, title, image: image(item.coverUrl) }
}
export function lycanList(value: unknown, page: number, previousIds?: string[]) {
  const data = object(value)
  const meta = object(data.pagination)
  const total = integer(meta.totalItems)
  const last = integer(meta.totalPages)
  const limit = integer(meta.itemsPerPage)
  if (!Array.isArray(data.series) || meta.currentPage !== page || !limit || last !== Math.max(1, Math.ceil(total / limit)) ||
    meta.hasNextPage !== (page < last) || data.series.length !== Math.min(limit, Math.max(0, total - (page - 1) * limit))) {
    throw new Error('Incomplete or repeated LycanToons catalog page')
  }
  const results = data.series.map(lycanCard)
  const ids = results.map(item => item.mangaId)
  if (new Set(ids).size !== ids.length || (ids.length && previousIds && ids.length === previousIds.length && ids.every((id, index) => id === previousIds[index]))) throw new Error('LycanToons repeated catalog titles')
  return { results, metadata: meta.hasNextPage ? { page: page + 1, previousIds: ids } : undefined }
}
export interface LycanChapter { id: number; number: number; title: string; createdAt: string; lockHours: number }
export function lycanChapters(value: unknown): LycanChapter[] {
  if (!Array.isArray(value)) throw new Error('Missing LycanToons chapters')
  return value.map(value => {
    const item = object(value)
    const id = integer(item.id)
    const createdAt = text(item.createdAt)
    if (!id || !Number.isFinite(Date.parse(createdAt))) throw new Error('Invalid LycanToons chapter ID or date')
    return { id, number: number(item.numero), title: text(item.titulo), createdAt, lockHours: number(item.vipLockHours) }
  })
}
export function lycanLocked(chapter: LycanChapter, now = Date.now()): boolean {
  return chapter.lockHours > 0 && now < Date.parse(chapter.createdAt) + chapter.lockHours * 3600000
}
export function lycanPages(value: unknown, chapter: LycanChapter): string[] {
  const data = object(value)
  if (data.id !== chapter.id || data.numero !== chapter.number) throw new Error('LycanToons returned a different chapter')
  if (!Array.isArray(data.pages) || !data.pages.length || data.pages.length !== integer(data.pageCount)) throw new Error('Incomplete LycanToons reader pages')
  const pages = data.pages.map(value => {
    const url = image(value)
    if (!isProbablePageImage(url, true)) throw new Error('Invalid LycanToons reader image')
    return url
  })
  return pages
}
