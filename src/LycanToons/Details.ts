import type { CheerioAPI } from 'cheerio'
import { absoluteUrl, normalizeText, pageId, sourceDocumentUrl } from '../shared/Urls'
import { LYCAN_BASE, lycanSlug } from './Parsing'
import { isLycanGenre } from './Genres'
import { lycanServerData, lycanServerObject } from './ServerData'

type Data = Record<string, unknown>
function text(value: unknown): string { return typeof value === 'string' ? normalizeText(value) : '' }

export function lycanDetails(cheerio: CheerioAPI, html: string, mangaId: string) {
  const stream = lycanServerData(cheerio, html)
  // The HTTP document carries serialized server props; Book JSON-LD is inserted into the DOM only by hydration.
  const book = lycanServerObject(stream, '{"@context":"https://schema.org","@type":"Book",')
  const manga = lycanServerObject(stream, '"obra":{')
  const slug = lycanSlug(mangaId)
  if (pageId(sourceDocumentUrl(text(book['@id']), LYCAN_BASE), LYCAN_BASE) !== `/series/${slug}` || manga.slug !== slug) {
    throw new Error('LycanToons returned details for a different manga')
  }
  const title = text(book.name)
  const image = absoluteUrl(text(book.image), LYCAN_BASE)
  if (!title || !image) throw new Error('Incomplete LycanToons manga metadata')
  const author = book.author && typeof book.author === 'object' ? text((book.author as Data).name) : ''
  const artist = text(manga.artist)
  const state = text(manga.status)
  const states: Record<string, string> = { ONGOING: 'ONGOING', COMPLETED: 'COMPLETED', HIATUS: 'HIATUS', CANCELLED: 'DISCONTINUED' }
  const labels = Array.isArray(book.genre) ? book.genre.map(text) : []
  const genres = Array.isArray(manga.genre) ? manga.genre.map((value, index) => ({ id: text(value), label: labels[index] || text(value) }))
    .filter(genre => isLycanGenre(genre.id) && isLycanGenre(genre.label)) : []
  return { titles: [...new Set([title, text(book.alternateName)].filter(Boolean))], image, desc: text(book.description),
    author: author === '-' ? '' : author, artist: artist === '-' || /^\$[a-f0-9:]+$/.test(artist) ? '' : artist, status: states[state] || 'UNKNOWN', genres }
}
