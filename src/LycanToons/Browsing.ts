import { lycanCard } from './Parsing'

export const lycanSections: { id: string; title: string; parameters: Record<string, unknown> }[] = [
  { id: 'highlights', title: 'Destaques', parameters: {} },
  { id: 'updated', title: 'Atualizações recentes', parameters: { orderBy: 'updated' } },
  { id: 'new', title: 'Novas obras', parameters: {} },
  { id: 'popular', title: 'Mais lidas', parameters: { orderBy: 'views' } },
  { id: 'originals', title: 'Originais', parameters: { original: true } }
]
export function lycanHighlights(value: unknown) {
  const data = value as { series?: unknown[] }
  if (!data || !Array.isArray(data.series)) throw new Error('Invalid LycanToons highlights')
  return { results: data.series.map(lycanCard) }
}
