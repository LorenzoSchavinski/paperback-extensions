/**
 * Reimplements the public NexusToons client response format, inspected 2026-10-16.
 * Fixed keys are SHA-256(`_orion_key_${index}_v2_OrionNexus2025CryptoKey!Secure`),
 * computed during development. No runtime hashing or browser APIs are needed.
 * Format attribution: https://nexustoons.com/assets/index-C5k-fnOg.js
 */
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64Bytes(value: string): Uint8Array {
  const encoded = value.replace(/[\t\n\f\r ]/g, '')
  const input = encoded.replace(/=+$/, '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || input.length % 4 === 1 ||
    (encoded.length !== input.length && encoded.length % 4 !== 0)) throw new Error('Invalid NexusToons base64 response')
  const bytes = new Uint8Array(Math.floor(input.length * 6 / 8))
  let bits = 0, count = 0, position = 0
  for (const character of input) {
    bits = (bits << 6) | alphabet.indexOf(character)
    count += 6
    if (count >= 8) { count -= 8; bytes[position++] = (bits >>> count) & 255 }
  }
  return bytes
}

const keys = [
  '7kf+IBxFkp25yakhLZw4VxllpDMmMj1jpI9grCmv69Y=',
  '5oCCzdhuX1k2XDHlMlkydiPDk7dSzXn16/SmwBzl2qU=',
  '4rxP8u+cNxOxJBFOf3+HouFGV/qszJ7c0Hfm9Ac8R3M=',
  'dxvQI077XOx1S5U+Nnjg1rJVLe3zhzKOnXYA2sFRtkk=',
  '1s2Z9nizYzdrTHIsw7E7ECwRlZ/x7ooxLLcw+ckUKxo='
].map(encoded => {
  const key = base64Bytes(encoded)
  const permutation = Array.from({ length: 256 }, (_, index) => index)
  let position = 0
  for (let index = 0; index < 256; index++) {
    position = (position + permutation[index] + key[index % key.length]) & 255
    const previous = permutation[index]
    permutation[index] = permutation[position]
    permutation[position] = previous
  }
  const inverse = new Uint8Array(256)
  permutation.forEach((value, index) => { inverse[value] = index })
  return { key, inverse }
})

export function nexusDecoded(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('d' in value)) return value
  const envelope = value as { d: unknown; k?: unknown; v?: unknown }
  if (envelope.v !== 1 && envelope.v !== 2) throw new Error('Unsupported NexusToons response version')
  const index = envelope.v === 1 ? 0 : envelope.k
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= keys.length || typeof envelope.d !== 'string') {
    throw new Error('Invalid NexusToons response envelope')
  }
  const { key, inverse } = keys[index]
  const cipher = base64Bytes(envelope.d)
  const plain = new Uint8Array(cipher.length)
  for (let index = 0; index < cipher.length; index++) {
    const byte = inverse[cipher[index] ^ (index ? cipher[index - 1] : key[31])]
    const rotation = ((key[(index + 3) % 32] + (index & 255)) & 255) % 7 + 1
    plain[index] = ((byte >>> rotation) | (byte << (8 - rotation))) ^ key[index % 32]
  }
  const encoded = Array.from(plain, byte => '%' + byte.toString(16).padStart(2, '0')).join('')
  try { return JSON.parse(decodeURIComponent(encoded)) as unknown }
  catch (_) { throw new Error('Invalid NexusToons encoded JSON response') }
}
