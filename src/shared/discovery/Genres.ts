import { SourceStateManager } from '@paperback/types'

export interface Genre { id: string; label: string }
const lifetime = 24 * 60 * 60 * 1000
interface Entry { version: number; expires: number; genres: Genre[] }

/** Public filter options survive source instances; native tags never enter storage. */
export class GenreCache {
  private state?: SourceStateManager
  private saved?: Entry
  private pending?: Promise<Genre[]>
  private readiness?: Promise<void>

  constructor(private readonly source: string, private readonly now = () => Date.now()) {}

  async load(loader: () => Promise<Genre[]>): Promise<Genre[]> {
    if (this.validEntry(this.saved)) return this.copy(this.saved.genres)
    this.prepare(loader)
    return this.copy(await this.pending!)
  }

  /** Resolve when storage is checked and the request starts, without waiting on HTTP. */
  prepare(loader: () => Promise<Genre[]>): Promise<void> {
    if (this.validEntry(this.saved)) return Promise.resolve()
    if (this.pending) return this.readiness!
    let ready!: () => void
    this.readiness = new Promise(resolve => { ready = resolve })
    const pending = this.read(loader, ready)
    this.pending = pending
    const clear = () => { if (this.pending === pending) this.pending = undefined }
    // Speculative preparation cannot fail the homepage. Explicit loads still await errors.
    pending.then(clear, clear)
    return this.readiness
  }

  private async read(loader: () => Promise<Genre[]>, ready: () => void): Promise<Genre[]> {
    try {
      this.state ??= App.createSourceStateManager()
      const key = 'discovery.genres.v1:' + this.source
      const saved: unknown = await this.state.retrieve(key)
      if (this.validEntry(saved)) {
        this.saved = saved
        return saved.genres
      }
      const loading = loader()
      ready()
      const genres = await loading
      if (!this.validGenres(genres)) throw new Error('Invalid source genre filters')
      const entry = { version: 1, expires: this.now() + lifetime, genres: this.copy(genres) }
      await this.state.store(key, entry)
      this.saved = entry
      return entry.genres
    } finally {
      ready()
    }
  }

  private validEntry(value: unknown): value is Entry {
    if (!value || typeof value !== 'object') return false
    const entry = value as Entry
    return entry.version === 1 && Number.isFinite(entry.expires) && entry.expires > this.now() &&
      entry.expires <= this.now() + lifetime && this.validGenres(entry.genres)
  }

  private validGenres(value: unknown): value is Genre[] {
    return Array.isArray(value) && value.length > 0 && value.length <= 500 &&
      value.every(genre => genre && typeof genre.id === 'string' && genre.id.trim() === genre.id && genre.id.length > 0 && genre.id.length <= 120 &&
        typeof genre.label === 'string' && genre.label.trim().length > 0 && genre.label.length <= 200) &&
      new Set(value.map(genre => genre.id)).size === value.length
  }

  private copy(genres: Genre[]): Genre[] { return genres.map(({ id, label }) => ({ id, label })) }
}
