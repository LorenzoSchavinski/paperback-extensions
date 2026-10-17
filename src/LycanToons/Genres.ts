export function isLycanGenre(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && !/^\?+$/.test(value.trim())
}

export function lycanGenres(value: unknown) {
  if (!Array.isArray(value) || value.some(genre => typeof genre !== 'string' || !genre.trim())) throw new Error('Invalid LycanToons genres')
  return [...new Set(value as string[])].filter(isLycanGenre).map(label => ({ id: label, label }))
}
