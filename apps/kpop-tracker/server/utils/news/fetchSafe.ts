import { validateExternalUrl, type ValidateUrlOptions } from './url'

/**
 * The only doorway the news pipeline uses to reach the public internet (§5,
 * §16). Every hop is re-validated against the SSRF rules, bodies are bounded,
 * content types are whitelisted, and failures are recorded as failures — no
 * fabricated content, no silent fallbacks.
 */

export interface SafeFetchOptions extends ValidateUrlOptions {
  timeoutMs?: number
  maxBytes?: number
  retries?: number
  maxRedirects?: number
  acceptContentTypes?: string[]
  /** Returns false when robots.txt disallows the path for us. */
  isAllowedByRobots?: (url: URL) => boolean
  headers?: Record<string, string>
  /**
   * HTTP method; defaults to GET. A non-GET request never follows a redirect —
   * re-sending a body to a redirect target is not a safe default, so a 3xx on a
   * POST is reported as a failure instead.
   */
  method?: 'GET' | 'POST'
  /** Request body (sent only for non-GET). */
  body?: string
  fetchImpl?: typeof fetch
  /** Injected for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>
}

export interface SafeFetchResult {
  ok: boolean
  status: number | null
  /** Final URL after redirects (still validated). */
  url: string
  redirected: boolean
  contentType: string
  body: string
  /** Raw bytes from the response body, available for charset transcoding. */
  rawBytes: Uint8Array
  bytes: number
  error: string | null
  attempts: number
}

const DEFAULT_ACCEPT = [
  'text/html',
  'application/xhtml+xml',
  'text/xml',
  'application/xml',
  // Korea Herald serves its feed as the bare, unregistered `xml` type.
  'xml',
  'application/rss+xml',
  'application/atom+xml',
  'application/json',
  'text/plain',
]

const DEFAULT_HEADERS = {
  // A honest identification: sources can throttle or block us by name, which
  // is exactly the behaviour we want to respect rather than evade.
  'user-agent': 'HIBIKISHOP-NewsBot/1.0 (+https://kpop-tracker-six.vercel.app; verification pipeline)',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en,ko;q=0.8',
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

/**
 * How long the server asked us to wait (seconds or an HTTP date), bounded so
 * a hostile header cannot park the run. Returns `null` when absent/unparsable.
 */
function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get('retry-after')
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && raw.trim() !== '') return Math.max(0, Math.min(seconds, 15) * 1000)
  const at = Date.parse(raw)
  if (Number.isFinite(at)) return Math.max(0, Math.min(at - Date.now(), 15000))
  return null
}

function contentTypeAllowed(contentType: string, allowed: string[]): boolean {
  const base = (contentType || '').split(';')[0]?.trim().toLowerCase() || ''
  if (!base) return true // some sources omit it entirely
  return allowed.some(entry => base === entry || (entry.endsWith('*') && base.startsWith(entry.slice(0, -1))))
}

async function readBounded(response: Response, maxBytes: number, controller: AbortController): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get('content-length') || '0')
  if (declared > maxBytes) {
    controller.abort()
    return null
  }
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        controller.abort()
        try {
          await reader.cancel()
        } catch { /* already aborted */ }
        return null
      }
      chunks.push(value)
    }
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

/**
 * Fetch one URL safely. Redirects are followed manually so each destination
 * passes the same private-network checks as the first request — a public URL
 * that 302s to `http://169.254.169.254/` is rejected, not followed.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 8000
  const maxBytes = options.maxBytes ?? 1048576
  const retries = options.retries ?? 2
  const maxRedirects = options.maxRedirects ?? 5
  const accept = options.acceptContentTypes ?? DEFAULT_ACCEPT
  const sleep = options.sleep || defaultSleep
  const method = options.method ?? 'GET'

  const failure = (error: string, url = rawUrl, attempts = 1): SafeFetchResult => ({
    ok: false, status: null, url, redirected: false, contentType: '', body: '', rawBytes: new Uint8Array(), bytes: 0, error, attempts,
  })

  let currentUrl = rawUrl
  let attempts = 0
  let redirects = 0

  for (;;) {
    const check = validateExternalUrl(currentUrl, options)
    if (!check.ok) return failure(`url rejected: ${check.reason}`, currentUrl, attempts + 1)
    const target = check.url

    if (options.isAllowedByRobots && !options.isAllowedByRobots(target)) {
      return failure('blocked by robots.txt', target.toString(), attempts + 1)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    attempts += 1
    let response: Response
    try {
      response = await fetchImpl(target.toString(), {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) },
        ...(method !== 'GET' && options.body !== undefined ? { body: options.body } : {}),
      })
    } catch (error) {
      clearTimeout(timer)
      if (attempts <= retries) {
        await sleep(500 * 2 ** (attempts - 1))
        continue
      }
      return failure(`request failed: ${(error as Error)?.message || 'network error'}`, target.toString(), attempts)
    }
    clearTimeout(timer)

    if (isRedirect(response.status)) {
      // A body is never re-sent to a redirect target: for a POST that would
      // turn one request into two, so a 3xx is terminal instead.
      if (method !== 'GET') {
        return failure(`upstream status ${response.status} (redirect on ${method})`, target.toString(), attempts)
      }
      const location = response.headers.get('location')
      if (!location) return failure('redirect without location', target.toString(), attempts)
      redirects += 1
      if (redirects > maxRedirects) return failure('too many redirects', target.toString(), attempts)
      try {
        currentUrl = new URL(location, target).toString()
      } catch {
        return failure('unparsable redirect target', target.toString(), attempts)
      }
      // 4xx/5xx from an intermediate hop: treat as terminal rather than retrying the chain.
      continue
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempts <= retries) {
        // Back off, and honour the server's own Retry-After when it sends one:
        // a source that throttles us is asking for a pause, not for a retry storm.
        await sleep(retryAfterMs(response) ?? 500 * 2 ** (attempts - 1))
        continue
      }
      return failure(`upstream status ${response.status}`, target.toString(), attempts)
    }

    if (!response.ok) {
      return failure(`upstream status ${response.status}`, target.toString(), attempts)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentTypeAllowed(contentType, accept)) {
      return failure(`unsupported content type "${contentType}"`, target.toString(), attempts)
    }

    const bytes = await readBounded(response, maxBytes, controller)
    if (bytes === null) return failure(`response larger than ${maxBytes} bytes`, target.toString(), attempts)

    const charset = /charset=([^\s;]+)/i.exec(contentType)?.[1] || 'utf-8'
    let body: string
    try {
      body = new TextDecoder(charset.replace(/["']/g, ''), { fatal: false }).decode(bytes)
    } catch {
      body = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    }

    return {
      ok: true,
      status: response.status,
      url: target.toString(),
      redirected: redirects > 0,
      contentType,
      body,
      rawBytes: bytes,
      bytes: bytes.byteLength,
      error: null,
      attempts,
    }
  }
}
