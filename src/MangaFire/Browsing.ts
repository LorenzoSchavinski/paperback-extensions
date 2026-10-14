import { mangaFireCard } from './Parsing'

export const mangaFireSections = [
  { id: 'latest', title: 'Latest updates', order: 'chapter_updated_at' },
  { id: 'new', title: 'Recently added', order: 'created_at' },
  { id: 'daily', title: 'Trending today', order: '' },
  { id: 'weekly', title: 'Popular this week', order: 'views_7d' },
  { id: 'monthly', title: 'Popular this month', order: 'views_30d' },
  { id: 'alltime', title: 'Popular all time', order: 'views_total' }
] as const

export function mangaFireTrendingCards(value: unknown) {
  const data = value as { items?: unknown[] }
  if (!data || !Array.isArray(data.items)) throw new Error('Invalid MangaFire trending response')
  return data.items.map(mangaFireCard)
}

export function mangaFireGenres(value: unknown) {
  const response = value as { data?: { genres?: { id: number; name: string }[] } }
  const genres = response?.data?.genres
  if (!Array.isArray(genres) || genres.some(item => !Number.isInteger(item.id) || item.id < 1 || !item.name)) {
    throw new Error('Invalid MangaFire genre filters')
  }
  return genres.map(item => ({ id: String(item.id), label: item.name }))
}
