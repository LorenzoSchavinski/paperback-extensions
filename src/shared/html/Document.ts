import type { CheerioAPI } from 'cheerio'

/** Challenges can arrive with HTTP 200 and after large head metadata. */
export function assertReadableDocument(cheerio: CheerioAPI, body: string, status: number, url: string, headers?: Record<string, unknown>): void {
  if (status === 403 || status === 503) throw new Error(`Website access blocked (HTTP ${status}) at ${url}. Open the source website in Paperback to check access.`)
  if (status < 200 || status >= 400) throw new Error(`HTTP ${status} for ${url}`)
  if (Object.entries(headers || {}).some(([name, value]) => name.toLowerCase() === 'cf-mitigated' && String(value).toLowerCase() === 'challenge')) {
    throw new Error(`Website sent a browser challenge instead of manga content: ${url}`)
  }
  if (!body.trim() || body.length < 20) throw new Error(`Website returned an empty document: ${url}`)
  // JSON endpoints validate their own schema. Do not build an HTML tree for JSON.
  if (/^\s*[\[{]/.test(body)) {
    try { JSON.parse(body); return } catch (_) { /* Invalid JSON may contain an HTML challenge. */ }
  }
  const $ = cheerio.load(body)
  const title = $('title').text()
  if (/^(?:just a moment|attention required|access denied)/i.test(title.trim()) ||
    $('#challenge-form, #cf-challenge-running, .cf-challenge').length) {
    throw new Error(`Website sent a browser challenge instead of manga content: ${url}`)
  }
  // A normal noscript hint to enable JavaScript is not an access challenge.
  if (!$('a[href], img, astro-island').length && /(?:checking your browser|verify you are human|enable javascript and cookies)/i.test($.text())) {
    throw new Error(`Website sent a browser challenge instead of manga content: ${url}`)
  }
}
