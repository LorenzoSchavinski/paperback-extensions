import { TagSection } from '@paperback/types'
import { Genre } from '../shared/discovery/Genres'

export const nexusCategoryGroups = [
  { id: 'genre', label: 'Gêneros', parameter: 'genres' },
  { id: 'theme', label: 'Temas', parameter: 'themes' },
  { id: 'format', label: 'Formatos', parameter: 'formats' }
]
interface Section { id: string; title: string; sort?: string; path?: string }
export const nexusSections: Section[] = [
  { id: 'trending', title: 'Em alta', path: '/api/mangas/trending?limit=10' },
  { id: 'latest', title: 'Últimas atualizações', sort: 'lastChapterAt' },
  { id: 'week', title: 'Mais lidos da semana', path: '/api/mangas/weekly?limit=20&metric=views' },
  { id: 'favorites', title: 'Mais favoritados da semana', path: '/api/mangas/weekly?limit=20&metric=favorites' },
  { id: 'popular', title: 'Mais lidos', sort: 'views' }
]
export function nexusFilters(tags: string[]): string[] {
  if (tags.some(tag => !/^(?:genre|theme|format):[1-9]\d*$/.test(tag))) throw new Error('Invalid NexusToons category selection')
  return nexusCategoryGroups.map(group => {
    const ids = tags.filter(tag => tag.startsWith(group.id + ':')).map(tag => tag.split(':')[1])
    return ids.length ? `${group.parameter}=${encodeURIComponent(ids.join(','))}` : ''
  }).filter(Boolean)
}
export function nexusTagSections(genres: Genre[]): TagSection[] {
  return nexusCategoryGroups.map(group => ({ ...group, tags: genres.filter(genre => genre.id.startsWith(group.id + ':')) }))
    .filter(group => group.tags.length)
    .map(group => App.createTagSection({ id: group.id, label: group.label, tags: group.tags.map(tag => App.createTag(tag)) }))
}
