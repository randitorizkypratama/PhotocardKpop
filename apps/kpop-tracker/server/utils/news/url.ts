/**
 * URL canonicalization and SSRF guards for every outbound request the news
 * pipeline makes (§16). Article-supplied URLs are hostile input: they may
 * point at `http://127.0.0.1:8080/admin`, a decimal-encoded loopback, or a
 * cloud metadata endpoint, so a URL is only ever fetched after passing here —
 * and again after every redirect hop.
 */

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'gclid', 'gclsrc', 'fbclid', 'igshid', 'igsh', 'yclid', 'msclkid', 'mc_cid',
  'mc_eid', 'twclid', 'ttclid', 'si', 'spm', 'ref', 'ref_src', '_hsenc', '_hsmi',
  'cmpid', 'ncid', 'ocid', 'ito', 'guccounter',
])

const ALLOWED_PORTS = new Set(['', '80', '443'])

export type UrlCheck =
  | { ok: true, url: URL, reason: '' }
  | { ok: false, url: null, reason: string }

/** Numeric/hex/IPv4-in-decimal tricks that spell 127.0.0.1 in one label. */
function isIpv4Literal(host: string): boolean {
  return /^\d+(\.\d+){3}$/.test(host) || /^0x[0-9a-f]+$/i.test(host)
}

function ipv4Octets(host: string): number[] | null {
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const value = Number.parseInt(host, 16)
    return [
      (value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255,
    ]
  }
  const parts = host.split('.').map(part => Number.parseInt(part, 10))
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null
}

/** Private, loopback, link-local, CGNAT, multicast and "this network". */
function isPrivateIpv4(host: string): boolean {
  const octets = ipv4Octets(host)
  if (!octets) return false
  const [a = 0, b = 0] = octets
  if (a === 0) return true                                    // 0.0.0.0/8
  if (a === 10) return true                                   // 10.0.0.0/8
  if (a === 127) return true                                  // loopback
  if (a === 169 && b === 254) return true                     // link-local (metadata)
  if (a === 172 && b >= 16 && b <= 31) return true            // 172.16.0.0/12
  if (a === 192 && b === 168) return true                     // 192.168.0.0/16
  if (a === 192 && b === 0) return true                       // 192.0.0.0/24 + 192.0.2.0/24
  if (a === 100 && b >= 64 && b <= 127) return true           // 100.64.0.0/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true        // benchmarking
  if (a >= 224) return true                                   // multicast + reserved
  return false
}

function isPrivateIpv6(host: string): boolean {
  const value = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (value === '::' || value === '::1') return true
  if (value.startsWith('fe80')) return true
  if (/^f[cd]/.test(value)) return true                       // fc00::/7 unique local
  if (value.startsWith('::ffff:')) {                          // IPv4-mapped
    const mapped = value.slice('::ffff:'.length)
    if (/^\d+(\.\d+){3}$/.test(mapped)) return isPrivateIpv4(mapped)
    return false
  }
  return false
}

function isBlockedHostname(rawHost: string): string | null {
  const host = rawHost.toLowerCase().replace(/\.$/, '')
  if (!host) return 'empty host'
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || host.endsWith('.internal') || host.endsWith('.localdomain')) {
    return `internal hostname "${host}"`
  }
  if (host.startsWith('[') || host.includes(':')) {
    return isPrivateIpv6(host) ? `private IPv6 "${host}"` : null
  }
  if (host.includes('%')) return 'scoped address not allowed'
  if (isIpv4Literal(host)) {
    if (isPrivateIpv4(host)) return `private IPv4 "${host}"`
    return null
  }
  // A bare label ("intranet") only resolves inside the network it belongs to.
  if (!host.includes('.')) return `hostname without a public suffix "${host}"`
  return null
}

export interface ValidateUrlOptions {
  /** When set, the host must be one of these (registrable domains, lowercase). */
  allowedDomains?: string[]
  /** Reject URLs without an explicit port allowlist entry (default: 80/443). */
  allowedPorts?: string[]
}

/**
 * Full check of an untrusted URL: scheme, credentials, port, host shape,
 * private ranges, and an optional domain allowlist.
 */
export function validateExternalUrl(raw: string, options: ValidateUrlOptions = {}): UrlCheck {
  const trimmed = (raw || '').trim()
  if (!trimmed) return { ok: false, url: null, reason: 'empty url' }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, url: null, reason: 'unparsable url' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, url: null, reason: `protocol "${url.protocol}" not allowed` }
  }
  if (url.username || url.password) {
    return { ok: false, url: null, reason: 'credentials in url' }
  }

  const ports = new Set(options.allowedPorts ?? [...ALLOWED_PORTS])
  if (!ports.has(url.port)) return { ok: false, url: null, reason: `port "${url.port}" not allowed` }

  const blocked = isBlockedHostname(url.hostname)
  if (blocked) return { ok: false, url: null, reason: blocked }

  if (options.allowedDomains?.length) {
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const allowed = options.allowedDomains.some((domain) => {
      const needle = domain.toLowerCase().replace(/^www\./, '')
      return host === needle || host.endsWith(`.${needle}`)
    })
    if (!allowed) return { ok: false, url: null, reason: `host "${url.hostname}" is not on the allowlist` }
  }

  return { ok: true, url, reason: '' }
}

/**
 * Stable identity for an article URL: tracking parameters removed, fragment
 * dropped, host lowercased. Two Google News links to the same story with
 * different `utm_*` values canonicalize identically, which is what makes
 * duplicate detection and idempotent ingestion work.
 */
export function canonicalizeUrl(raw: string): string {
  const check = validateExternalUrl(raw)
  if (!check.ok) return ''
  const url = check.url
  const keep: Array<[string, string]> = []
  for (const [key, value] of url.searchParams.entries()) {
    if (!TRACKING_PARAMS.has(key.toLowerCase())) keep.push([key, value])
  }
  keep.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
  const query = keep.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
  const path = url.pathname || '/'
  return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ''}`
}

/** Hostname of a URL, or null when it does not parse. */
export function hostnameOf(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Only http(s) assets may be shown/embedded in the UI. */
export function isRenderableMediaUrl(raw: string | null | undefined): boolean {
  if (!raw) return false
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return false
    return !isBlockedHostname(url.hostname)
  } catch {
    return false
  }
}
