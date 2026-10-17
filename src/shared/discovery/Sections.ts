import { HomeSection } from '@paperback/types'
import { DiscoveryPage } from './Page'

export async function loadDiscoverySections(
  definitions: readonly { id: string; title: string; containsMoreItems?: boolean }[],
  callback: (section: HomeSection) => void,
  prepare: () => Promise<void>,
  load: (id: string) => Promise<DiscoveryPage>
): Promise<void> {
  const sections = definitions.map(definition => App.createHomeSection({
    id: definition.id, title: definition.title, type: 'singleRowNormal', containsMoreItems: definition.containsMoreItems ?? false, items: []
  }))
  sections.forEach(callback)
  await prepare()
  const outcomes = await Promise.allSettled(sections.map(async section => {
    const page = await load(section.id)
    section.items = page.results.slice(0, 10).map(card => App.createPartialSourceManga(card))
    section.containsMoreItems = page.results.length > section.items.length || !!page.metadata
    callback(section)
  }))
  for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason
}
