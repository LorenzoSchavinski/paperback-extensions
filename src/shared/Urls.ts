/** Pure URL helpers. No DOM / SDK dependencies; testable in Node. */
export function absoluteUrl(raw: string | null | undefined, pageUrl: string): string {
  let value = (raw || '').trim().replace(/&amp;/g, '&')
  if (!value || /^(?:data|blob|javascript|file|mailto):/i.test(value) || value.startsWith('#')) return ''
  value = value.replace(/\\\//g, '/')
  try {
    if (typeof URL !== 'undefined') {
      const parsed = new URL(value, pageUrl)
      if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname) return ''
      parsed.hash = ''
      return parsed.href
    }
    // JavaScriptCore environments may not expose the browser URL constructor.
    return resolveWithoutBrowserURL(value, pageUrl)
  } catch (_) { return '' }
}

/** Avoid prefix checks: https://domain.evil.test is NOT the same origin. */
export function sameOrigin(url: string, base: string): boolean {
  const one = originOf(url)
  return !!one && one === originOf(base)
}

/** Stable ids: paths only, not domain nor tracking query parameters. */
export function pageId(url: string, base: string): string {
  if (!sameOrigin(url, base)) return ''
  const path = url.slice(originOf(url).length).split(/[?#]/)[0]
  return path.replace(/\/+$/, '') || '/'
}

/** Resolve a previous ID, always enforcing source origin. */
export function sourceDocumentUrl(id: string, base: string): string {
  const url = absoluteUrl(id, base)
  if (!url || !sameOrigin(url, base)) throw new Error('Rejected off-site or invalid manga/chapter link')
  return url
}

export function normalizeText(text: string | undefined | null): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

export function chapterNumber(text: string): number {
  const match = /(?:\bchapter\b|\bchap\.?\b|\bch\.?\b|\bepisode\b|\bep\.?\b|\/chapter\/|\/chap\/|\/ch\/)[\s:/._#-]*(\d+(?:[.\-]\d+)?)/i.exec(text)
  if (!match) {
    // Some sites use plain numeric chapter labels: "5-eng-li" or "#34".
    const simple = /^(?:#\s*)?(\d+(?:\.\d+)?)(?:-eng-li)?$/i.exec(normalizeText(text))
    return simple ? Number(simple[1]) : 0
  }
  const number = match[1].replace('-', '.')
  return Number(number) || 0
}

export function isProbablePageImage(url: string, allowDynamicImageUrls = false): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  if (/\.(?:svg|gif|ico)(?:\?|$)/i.test(url)) return false
  if (/(?:avatar|logo|banner|sprite|emoji|icon|thumb(?:nail)?|pixel|tracking|favicon|covers?)(?:[\W_]|$)/i.test(url)) return false
  return /\.(?:jpe?g|png|webp|avif|bmp)(?:[?#]|$)/i.test(url) ||
    (allowDynamicImageUrls && /\/(?:page|image|media|chapter|cdn)\//i.test(url))
}

/** Parse a srcset while keeping URLs that may contain queries. */
export function largestSrcset(srcset: string): string {
  const choices = srcset.split(',').map((part, index) => {
    const parts = part.trim().split(/\s+/)
    const width = /^(\d+)(?:w)$/.exec(parts[1] || '')
    const density = /^(\d+(?:\.\d+)?)(?:x)$/.exec(parts[1] || '')
    return { url: parts[0], quality: width ? Number(width[1]) : density ? Number(density[1]) : index }
  }).filter(item => item.url)
  return choices.sort((a,b) => b.quality - a.quality)[0]?.url || ''
}

function originOf(url: string): string {
  const match = /^(https?):\/\/([^/?#]+)/i.exec(url)
  if (!match) return ''
  const host = match[2].toLowerCase()
  if (host.includes('@') || /[^a-z0-9.:[\]-]/.test(host)) return ''
  const protocol = match[1].toLowerCase()
  const defaultPort = protocol === 'https' ? /:443$/ : /:80$/
  return `${protocol}://${host.replace(defaultPort, '')}`
}

function resolveWithoutBrowserURL(value: string, base: string): string {
  const baseOrigin = originOf(base)
  if (!baseOrigin) return ''
  let target = value
  if (value.startsWith('//')) target = baseOrigin.split(':')[0] + ':' + value
  else if (!/^https?:\/\//i.test(value)) {
    const basePath = base.slice(baseOrigin.length).split(/[?#]/)[0] || '/'
    let path = value
    if (value.startsWith('?')) path = basePath + value
    else if (!value.startsWith('/')) path = basePath.replace(/\/[^/]*$/, '/') + value
    target = baseOrigin + path
  }
  const origin = originOf(target)
  if (!origin) return ''
  const remainder = target.slice(target.indexOf('://') + 3)
  const suffixStart = remainder.search(/[/?#]/)
  let suffix = suffixStart === -1 ? '/' : remainder.slice(suffixStart)
  if (suffix.startsWith('?')) suffix = '/' + suffix
  const fragmentless = suffix.split('#')[0]
  const parts = fragmentless.split('?')
  const clean: string[] = []
  for (const part of parts[0].split('/')) {
    if (part === '..') clean.pop()
    else if (part && part !== '.') clean.push(part)
  }
  return origin + '/' + clean.join('/') + (parts.length > 1 ? '?' + parts.slice(1).join('?') : '')
}
