import { absoluteUrl, isProbablePageImage, normalizeText, pageId, sourceDocumentUrl } from '../shared/Urls'

export const NEXUS_BASE = 'https://nexustoons.com'
type Data = Record<string, unknown>
function object(value: unknown): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid NexusToons response')
  return value as Data
}
function text(value: unknown): string { return typeof value === 'string' ? normalizeText(value) : '' }
function integer(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error('Invalid NexusToons count or ID')
  return value
}
function image(value: unknown): string {
  const url = absoluteUrl(text(value), NEXUS_BASE)
  if (!url) throw new Error('Missing NexusToons image URL')
  return url
}
export function nexusSlug(mangaId: string): string {
  const path = pageId(sourceDocumentUrl(mangaId, NEXUS_BASE), NEXUS_BASE)
  const match = /^\/manga\/([^/]+)$/.exec(path)
  let slug = ''
  try { slug = decodeURIComponent(match?.[1] || '') } catch (_) { throw new Error('Invalid NexusToons manga ID') }
  if (!slug || /[/\\?#\u0000-\u0020\u007f]/.test(slug)) throw new Error('Invalid NexusToons manga ID')
  return slug
}
function nexusCard(value: unknown) {
  const item = object(value)
  const mangaId = `/manga/${encodeURIComponent(typeof item.slug === 'string' ? item.slug : '')}`
  nexusSlug(mangaId)
  const title = text(item.title)
  if (!title) throw new Error('Missing NexusToons title')
  return { mangaId, title, image: image(item.coverImage) }
}
export function nexusList(value: unknown, page: number, previousIds?: string[]) {
  const data = object(value)
  const total = integer(data.total)
  const limit = integer(data.limit, 1)
  const last = integer(data.pages)
  const items = total === 0 && data.data === null ? [] : data.data
  if (!Array.isArray(items) || data.page !== page || last !== Math.ceil(total / limit) ||
    items.length !== Math.min(limit, Math.max(0, total - (page - 1) * limit))) throw new Error('Incomplete NexusToons catalog page')
  const results = items.map(nexusCard)
  const ids = results.map(item => item.mangaId)
  if (new Set(ids).size !== ids.length || (ids.length && previousIds && ids.length === previousIds.length && ids.every((id, index) => id === previousIds[index]))) {
    throw new Error('NexusToons repeated catalog titles')
  }
  return { results, metadata: page < last ? { page: page + 1, previousIds: ids } : undefined }
}
export function nexusRanking(value: unknown) {
  const data = object(value)
  if (!Array.isArray(data.data)) throw new Error('Missing NexusToons ranking titles')
  return { results: data.data.map(nexusCard) }
}
function nexusCategory(value: unknown) {
  const category = object(value)
  return { id: `${text(category.type)}:${integer(category.id, 1)}`, label: text(category.name) }
}
export function nexusGenres(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Missing NexusToons category filters')
  return value.map(nexusCategory).filter(category => category.label)
}
function alternateTitles(value: unknown): string[] {
  const title = text(value)
  if (!title) return []
  if (!title.startsWith('[')) return [title]
  try {
    const titles: unknown = JSON.parse(title)
    return Array.isArray(titles) ? titles.map(value => text(object(value).title)).filter(Boolean) : []
  } catch (_) { return [] }
}
export interface NexusChapter { id: number; number: number; title: string; createdAt: string; available: boolean }
export function nexusManga(value: unknown, mangaId: string) {
  const data = object(value)
  const id = integer(data.id, 1)
  if (data.slug !== nexusSlug(mangaId)) throw new Error('NexusToons returned a different manga')
  const title = text(data.title)
  if (!title || !Array.isArray(data.chapters)) throw new Error('Incomplete NexusToons manga details')
  const chapters: NexusChapter[] = data.chapters.map(value => {
    const chapter = object(value)
    const label = text(chapter.number)
    const createdAt = text(chapter.createdAt)
    if (chapter.mangaId !== id || !/^\d+(?:\.\d+)?$/.test(label) || !Number.isFinite(Number(label)) || !Number.isFinite(Date.parse(createdAt)) ||
      !text(chapter.accessLevel) || !text(chapter.releaseStatus)) throw new Error('Invalid NexusToons chapter metadata')
    return { id: integer(chapter.id, 1), number: Number(label), title: text(chapter.title), createdAt,
      available: chapter.accessLevel === 'public' && chapter.releaseStatus === 'published' }
  })
  if (new Set(chapters.map(chapter => chapter.id)).size !== chapters.length) throw new Error('NexusToons repeated chapters')
  chapters.sort((a, b) => b.number - a.number)
  const categories = data.categories ?? []
  if (!Array.isArray(categories)) throw new Error('Missing NexusToons categories')
  const genres = categories.map(nexusCategory).filter(genre => genre.label)
  const states: Record<string, string> = { ongoing: 'ONGOING', completed: 'COMPLETED', hiatus: 'HIATUS', dropped: 'DISCONTINUED' }
  const additionalInfo = Object.fromEntries([
    ['Tipo', text(data.type)], ['Ano', typeof data.releaseYear === 'number' ? String(data.releaseYear) : ''],
    ['Editora', text(data.publisher)], ['Estúdio', text(data.studio)], ['Volumes', typeof data.volumes === 'number' && data.volumes > 0 ? String(data.volumes) : ''],
    ['Site oficial', absoluteUrl(text(data.officialLink), NEXUS_BASE)]
  ].filter(([, value]) => value))
  return { id, chapters, titles: [...new Set([title, ...alternateTitles(data.alternativeTitles)])], image: image(data.coverImage), desc: text(data.description),
    author: text(data.author), artist: text(data.artist), status: states[text(data.status)] || 'UNKNOWN', genres, additionalInfo,
    banner: absoluteUrl(text(data.bannerImage), NEXUS_BASE) || undefined,
    rating: typeof data.rating === 'number' && Number.isFinite(data.rating) ? data.rating : undefined }
}
export function nexusChapterId(chapterId: string, mangaId: string): number {
  const path = pageId(sourceDocumentUrl(chapterId, NEXUS_BASE), NEXUS_BASE)
  const match = /^\/ler\/([^/]+)\/(\d+)$/.exec(path)
  if (!match || match[1] !== encodeURIComponent(nexusSlug(mangaId))) throw new Error('NexusToons chapter does not belong to this manga')
  return integer(Number(match[2]), 1)
}
export function nexusPages(value: unknown, manga: ReturnType<typeof nexusManga>, chapter: NexusChapter): string[] {
  const data = object(value)
  if (data.id !== chapter.id || data.mangaId !== manga.id) throw new Error('NexusToons returned a different chapter')
  if (data.requiresSession) throw new Error('This NexusToons chapter requires a browser reader session')
  if (data.accessLevel !== 'public' || data.releaseStatus !== 'published') throw new Error('This NexusToons chapter is not publicly available')
  if (data.contentType !== 'images') throw new Error('NexusToons text chapters are not supported')
  if (!Array.isArray(data.pages) || !data.pages.length || data.pages.length !== integer(data.totalPages, 1)) throw new Error('Incomplete NexusToons reader pages')
  const pages = data.pages.map((value, index) => {
    const page = object(value)
    const url = image(page.imageUrl)
    if (page.pageNumber !== index + 1 || !isProbablePageImage(url, true)) throw new Error('Invalid NexusToons reader page')
    return url
  })
  return pages
}
