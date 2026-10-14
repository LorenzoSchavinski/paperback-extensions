import { PagedResults } from '@paperback/types'

export interface DiscoveryPage {
  results: { mangaId: string; title: string; image: string }[]
  metadata?: { page: number; previousIds?: string[] }
}

export function createDiscoveryPage(page: DiscoveryPage): PagedResults {
  return App.createPagedResults({ results: page.results.map(item => App.createPartialSourceManga(item)), metadata: page.metadata })
}
