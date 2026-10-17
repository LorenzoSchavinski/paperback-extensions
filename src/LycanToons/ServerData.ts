import type { CheerioAPI } from 'cheerio'
import { pageId, sourceDocumentUrl } from '../shared/Urls'
import { LYCAN_BASE } from './Parsing'

export function lycanServerData(cheerio: CheerioAPI, html: string, path?: string): string {
  const $ = cheerio.load(html)
  if (path && pageId(sourceDocumentUrl($('link[rel="canonical"]').attr('href') || '', LYCAN_BASE), LYCAN_BASE) !== path) {
    throw new Error('LycanToons returned a different document')
  }
  let stream = ''
  $('script').each((_, element) => {
    const match = /^self\.__next_f\.push\((\[[\s\S]*\])\);?$/.exec(($(element).html() || '').trim())
    if (!match) return
    const frame: unknown = JSON.parse(match[1])
    if (!Array.isArray(frame)) throw new Error('Invalid LycanToons server data frame')
    if (frame[0] === 1 && typeof frame[1] === 'string') stream += frame[1]
  })
  return stream
}

export function lycanServerObject(stream: string, marker: string): Record<string, unknown> {
  const position = stream.indexOf(marker)
  const start = position < 0 ? -1 : stream.indexOf('{', position)
  if (start < 0) throw new Error('Missing LycanToons server metadata')
  let depth = 0, quoted = false, escaped = false
  for (let end = start; end < stream.length; end++) {
    const character = stream[end]
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
    } else if (character === '"') quoted = true
    else if (character === '{') depth++
    else if (character === '}' && --depth === 0) return JSON.parse(stream.slice(start, end + 1)) as Record<string, unknown>
  }
  throw new Error('Incomplete LycanToons server metadata')
}
