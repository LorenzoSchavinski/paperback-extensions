export interface SiteConfig {
  readonly base: string
  /** Candidate tiles or links only; filtered by mangaPath below. */
  readonly cards: string
  /** Only this part of the catalog can explicitly declare an empty result. */
  readonly emptyResults?: string
  readonly mangaPath: RegExp
  readonly chapters: string
  readonly chapterName?: string
  readonly chapterPath: RegExp
  readonly reader: string
  readonly readerMustHaveAltPage?: boolean
  readonly cover: string
  readonly description: string
}
