/**
 * SPDX-License-Identifier: Apache-2.0
 * Adapted from keiyoushi/extensions-source VrfSigner.kt.
 * Changed: portable TypeScript UTF-8/base64 and query handling.
 * Attribution and license: src/MangaFire/includes/licenses/.
 */
const tables = [
  'yINlmUNho8VYJT+ibTIP+9ESiULpVEtMOoD6U6lRE0R/xwXo/Xp9NrUgC4cw/Lmo33vUyjUE40kUoEWIr/fxfNNcq2s79ShQ5NhNrFnJ4hXPwOu/SuXzIbuTQKGFvfm08E9jvCfqAtoDqvQq3dVWPQFmJjgvkISBeXY3BgANR+yVnjGbcxZ47d6kLNfZPIayTq3/YGySb1KuVZodWp/WGNAO5pfMcpaK53Hhs0allBszaMaxuouOwdxbwgxIw6YunSsXjI05Yi0j9j4eHKfSXR8Ifo/Od+8iamRfCXTyvm7NGRGYdcQ0ywcK/u6RXhrbcCm4t2eCtrDgQVecJGkQ+A==',
  'IUFltCxD3Oc2cwCgkJffthaOg9cgPUb0LgW6H/VtfcF0kc5F25t+aWj6JH9VOhOaY0rAFdUxlDnl5BLNvwEJvQtP5qcw7vdb/K+chnbwnspSHT8mz5lqwz41TezG0hkO06FTjJZhsyNuFLDpD2ZZxQj/QIRcF90zpmQ7Byu483WsQqUE0C342HL+JXngRB6fRzxRyVTaKu83h7UYTJ0QMt6ixFh6S3F8gqkKwrGTL3jHNBsD45UnifK8+RGtishQV2K3rujLKEkiZxpr2dYcudFW4oFsDKhad3CLBvuyTqsCo4B7mL5IKQ1vXo/MOOvq1I1d8ar9X6Ttu5KF4fZgiA==',
  'NQHlu1/wVO5EmkwQymF810qqY2xG1k2obcas4Z9mCsPEIFl9pRIjFxbJ7ybMHbBckT5Ton85E0FOeHezbh/mjlEYpmpnlXOS8dgrqeq2KfxImTh1YK9y0PeMNhzA1OQzSY9brYOJq/l2QnE/hwOeZIhPixVSKIUlDb5vLcH6RWKxkIEMuP0bDwIqQ71AJJaEaMJL7A6YtyIwoRT+L5v4aZzodN/0+3nOGsfblFjgxSfPzVDjNFeNl5P26+kEC/8AHgdrpAbt3hHz3HrRN1Y6e+JHgF7ncFWnoF0y3THL1S71WgWGCa6KtSzTCCG58n68nTyj2T3Sshk7utqCtMi/ZQ=='
]
const keys = ['0Ec58JOY3uBzJK9m3zqIOpdlF7UFiax9DmA=', 'AAdjb1iPY8CiDmq9H34tKTBF8a3oDQ==', 'DELOJgPsVaCcblDtTGMdHzM=']
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function fromBase64(value: string): number[] {
  const bytes: number[] = []
  let bits = 0, count = 0
  for (const character of value.replace(/=+$/, '')) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) throw new Error('Invalid MangaFire signing table')
    bits = (bits << 6) | digit
    count += 6
    if (count >= 8) { count -= 8; bytes.push((bits >>> count) & 255) }
  }
  return bytes
}
const stages = tables.map((table, index) => ({ table: fromBase64(table), key: fromBase64(keys[index]), initial: [90, 53, 186][index] }))

function signMangaFirePath(path: string): string {
  const encoded = encodeURIComponent(path)
  let bytes: number[] = []
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') { bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16)); i += 2 }
    else bytes.push(encoded.charCodeAt(i))
  }
  for (const stage of stages) {
    let previous = stage.initial
    bytes = bytes.map((byte, index) => {
      previous = stage.table[byte ^ stage.key[index % stage.key.length] ^ previous]
      return previous
    })
  }
  let output = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const value = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0)
    output += alphabet[(value >>> 18) & 63] + alphabet[(value >>> 12) & 63]
    if (i + 1 < bytes.length) output += alphabet[(value >>> 6) & 63]
    if (i + 2 < bytes.length) output += alphabet[value & 63]
  }
  return output.replace(/\+/g, '-').replace(/\//g, '_')
}

export function mangaFireApiUrl(path: string, parameters: Record<string, string | number> = {}): string {
  if (!/^\/(?:titles(?:\/[a-z0-9]+(?:\/chapters)?)?|chapters\/\d+|top-titles|filter-options)$/i.test(path)) throw new Error('Invalid MangaFire API path')
  const entries = Object.entries(parameters).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  const rawQuery = entries.map(([key, value]) => `${key}=${value}`).join('&')
  const token = signMangaFirePath(path + (rawQuery ? '?' + rawQuery : ''))
  const query = entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  query.push(`vrf=${token}`)
  return `https://mangafire.to/api${path}?${query.join('&')}`
}
