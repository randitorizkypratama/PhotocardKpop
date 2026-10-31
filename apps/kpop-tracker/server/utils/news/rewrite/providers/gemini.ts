/**
 * Gemini client — the only AI provider in this pipeline.
 *
 * Split into `buildGeminiRequest` / `parseGeminiResponse` (pure, unit-tested)
 * and a thin `callGemini` that takes the transport as an argument. That is the
 * same shape the translation client uses: tests never touch the network, and
 * the transport keeps the polite timeout/byte-cap behaviour of `safeFetch`.
 */

export const GEMINI_MODEL_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface GeminiRequestInput {
  model: string
  apiKey: string
  prompt: string
  maxTokens: number
  temperature: number
}

export interface GeminiHttpRequest {
  url: string
  headers: Record<string, string>
  body: string
}

export function buildGeminiRequest(input: GeminiRequestInput): GeminiHttpRequest {
  return {
    url: `${GEMINI_MODEL_ENDPOINT}/${encodeURIComponent(input.model)}:generateContent`,
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      // A header, not `?key=`, so the key never reaches a URL, a log or a referrer.
      'x-goog-api-key': input.apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
      generationConfig: {
        temperature: input.temperature,
        maxOutputTokens: input.maxTokens,
        // Ask for structured output; the validator still re-checks every field.
        responseMimeType: 'application/json',
      },
    }),
  }
}

export interface GeminiParsed {
  ok: boolean
  text: string | null
  error: string | null
  /** This key should be put on cooldown (quota / rate limit). */
  quota: boolean
  /**
   * The failure is transient (overload, internal error, deadline) — the pool
   * should cool this key down and try the next one instead of giving up on the
   * article. `gemini-flash-latest` regularly answers 503 UNAVAILABLE when it is
   * under high demand.
   */
  retryable: boolean
}

const TRANSIENT_STATUSES = new Set(['UNAVAILABLE', 'INTERNAL', 'DEADLINE_EXCEEDED', 'RESOURCE_EXHAUSTED'])

function isTransientStatus(status: number | null): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

export function parseGeminiResponse(status: number | null, body: string): GeminiParsed {
  let payload: any
  try {
    payload = JSON.parse(body)
  } catch {
    // A throttled request can come back with an empty or HTML body.
    return { ok: false, text: null, error: 'gemini returned non-JSON', quota: status === 429, retryable: isTransientStatus(status) }
  }

  if (payload?.error) {
    const errorStatus = typeof payload.error.status === 'string' ? payload.error.status : ''
    const message = typeof payload.error.message === 'string' ? payload.error.message : ''
    const quota = status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(`${errorStatus} ${message}`)
    return {
      ok: false,
      text: null,
      error: `gemini error${errorStatus ? ` ${errorStatus}` : ''}: ${message || 'unknown error'}`,
      quota,
      retryable: quota || isTransientStatus(status) || TRANSIENT_STATUSES.has(errorStatus),
    }
  }

  const blockReason = payload?.promptFeedback?.blockReason
  if (blockReason) {
    return { ok: false, text: null, error: `gemini blocked the prompt (${String(blockReason)})`, quota: false, retryable: false }
  }

  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null
  const finish = typeof candidate?.finishReason === 'string' ? candidate.finishReason : null
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
  const text = parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()

  if (!text) {
    return { ok: false, text: null, error: `gemini returned no text${finish ? ` (${finish})` : ''}`, quota: false, retryable: false }
  }
  if (finish === 'MAX_TOKENS') {
    // The JSON is cut off, so it cannot be trusted even though text exists.
    return { ok: false, text: null, error: 'gemini response was truncated (MAX_TOKENS)', quota: false, retryable: false }
  }

  return { ok: true, text, error: null, quota: false, retryable: false }
}

export interface GeminiHttpResult {
  status: number | null
  body: string
  error: string | null
}

/** Transport injection point: real runs wrap `safeFetch`, tests pass a fake. */
export type GeminiTransport = (
  request: GeminiHttpRequest,
  options: { timeoutMs: number },
) => Promise<GeminiHttpResult>

export interface GeminiCallResult extends GeminiParsed {
  status: number | null
}

export async function callGemini(
  input: GeminiRequestInput,
  options: { timeoutMs: number, transport: GeminiTransport },
): Promise<GeminiCallResult> {
  const request = buildGeminiRequest(input)
  const response = await options.transport(request, { timeoutMs: options.timeoutMs })

  if (response.error) {
    return {
      ok: false,
      status: response.status,
      text: null,
      error: response.error,
      quota: response.status === 429,
      retryable: isTransientStatus(response.status),
    }
  }

  return { ...parseGeminiResponse(response.status, response.body), status: response.status }
}
