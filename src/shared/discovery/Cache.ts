/** Short lived discovery data only. Native objects must be created after loading. */
export class DiscoveryCache<T> {
  private readonly values = new Map<string, { expires: number; value: T }>()
  private readonly pending = new Map<string, Promise<T>>()

  constructor(private readonly ttl = 30000, private readonly now = () => Date.now()) {}

  async load(key: string, loader: () => Promise<T>): Promise<T> {
    const time = this.now()
    for (const [id, entry] of this.values) if (entry.expires <= time) this.values.delete(id)
    const saved = this.values.get(key)
    if (saved) return this.copy(saved.value)
    let operation = this.pending.get(key)
    if (!operation) {
      operation = (async () => {
        const value = this.copy(await loader())
        this.values.set(key, { value, expires: this.now() + this.ttl })
        return value
      })()
      this.pending.set(key, operation)
    }
    try { return this.copy(await operation) }
    finally { if (this.pending.get(key) === operation) this.pending.delete(key) }
  }

  private copy(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
}
