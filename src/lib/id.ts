const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Short random id. Uses crypto.getRandomValues rather than randomUUID because
 * randomUUID is missing in insecure contexts (e.g. a phone hitting the dev
 * server over a LAN IP).
 */
export function createId(prefix = '', length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let id = prefix
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length]
  return id
}
