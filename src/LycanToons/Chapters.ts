import type { CheerioAPI } from 'cheerio'
import { lycanChapters, lycanSlug } from './Parsing'
import { lycanServerData, lycanServerObject } from './ServerData'

export interface LycanSeries { id: string; slug: string; total: number; first: number | null }

export function lycanChapterSeries(cheerio: CheerioAPI, html: string, mangaId: string): LycanSeries {
  const slug = lycanSlug(mangaId)
  const manga = lycanServerObject(lycanServerData(cheerio, html, `/series/${slug}`), '"obra":{')
  if (manga.slug !== slug || typeof manga.id !== 'string' || !manga.id) throw new Error('LycanToons returned a different manga')
  const total = manga.chapters
  const first = manga.firstChapterNumero
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 ||
    (total ? typeof first !== 'number' || !Number.isFinite(first) || first < 0 : first != null)) {
    throw new Error('Invalid LycanToons chapter summary')
  }
  return { id: manga.id, slug, total, first: total ? first as number : null }
}

export function lycanReaderChapters(cheerio: CheerioAPI, html: string, series: LycanSeries) {
  const stream = lycanServerData(cheerio, html, `/series/${series.slug}/${series.first}`)
  const manga = lycanServerObject(stream, '"seriesData":{')
  const selected = lycanServerObject(stream, '"chapterData":{')
  if (manga.id !== series.id || manga.slug !== series.slug) throw new Error('LycanToons returned a different manga')
  const chapters = lycanChapters(manga.capitulos)
  if (chapters.length !== series.total) throw new Error('Incomplete LycanToons chapter list')
  if (new Set(chapters.map(chapter => chapter.id)).size !== chapters.length ||
    new Set(chapters.map(chapter => chapter.number)).size !== chapters.length) throw new Error('LycanToons repeated chapters')
  if (selected.numero !== series.first || !chapters.some(chapter => chapter.id === selected.id && chapter.number === selected.numero)) {
    throw new Error('LycanToons returned a different reader chapter')
  }
  return chapters.sort((a, b) => b.number - a.number)
}
