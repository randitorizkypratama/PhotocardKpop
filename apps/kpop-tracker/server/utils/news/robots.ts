/**
 * Minimal robots.txt support (§5). Only what the pipeline needs: does the
 * site's own policy allow this path for our crawler. If robots.txt cannot be
 * fetched the call is allowed (per RFC 9309); if it parses to a Disallow for
 * us, the URL is recorded as a limitation and never fetched.
 */

export interface RobotsPolicy {
  /** Longest-match rules for our crawler, plus the generic `*` group. */
  specific: { allow: string[], disallow: string[] } | null
  wildcard: { allow: string[], disallow: string[] } | null
}

interface RawGroup {
  userAgent: string[]
  allow: string[]
  disallow: string[]
}

export function parseRobots(text: string): RobotsPolicy {
  const groups: RawGroup[] = []
  let current: RawGroup | null = null
  let seenRule = false

  for (const rawLine of (text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line || !line.includes(':')) continue
    const index = line.indexOf(':')
    const field = line.slice(0, index).trim().toLowerCase()
    const value = line.slice(index + 1).trim()

    if (field === 'user-agent') {
      // A new group starts when the previous block already had rules.
      if (!current || seenRule) {
        current = { userAgent: [], allow: [], disallow: [] }
        groups.push(current)
        seenRule = false
      }
      current.userAgent.push(value.toLowerCase())
      continue
    }
    if (!current) continue
    if (field === 'allow') {
      current.allow.push(value)
      seenRule = true
    } else if (field === 'disallow') {
      // An empty Disallow means "allow everything".
      if (value) current.disallow.push(value)
      seenRule = true
    }
  }

  const isOurs = (group: RawGroup) =>
    group.userAgent.some(agent => agent === '*' || agent.includes('hibikishop'))

  const ours = groups.filter(isOurs)
  const specific = ours.find(group => group.userAgent.some(agent => agent !== '*')) || null
  const wildcard = ours.find(group => group.userAgent.includes('*')) || null

  return {
    specific: specific ? { allow: specific.allow, disallow: specific.disallow } : null,
    wildcard: wildcard ? { allow: wildcard.allow, disallow: wildcard.disallow } : null,
  }
}

function escapeLiteral(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Robots patterns: `*` matches any run of characters and a trailing `$`
 * anchors to the end of the path — both are metacharacters of the robots
 * grammar, not literals. `Allow: /$` therefore means "allow exactly the
 * homepage", which is how SM Entertainment and Google News write it.
 */
function matchPath(pattern: string, path: string): boolean {
  if (!pattern) return false
  let source = ''
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!
    if (char === '*') source += '.*'
    else if (char === '$' && index === pattern.length - 1) source += '$'
    else source += escapeLiteral(char)
  }
  return new RegExp(`^${source}`).test(path)
}

/** Longest matching rule wins, as RFC 9309 specifies. */
function groupAllows(group: { allow: string[], disallow: string[] }, path: string): boolean {
  let allowLen = -1
  for (const pattern of group.allow) {
    if (matchPath(pattern, path)) allowLen = Math.max(allowLen, pattern.length)
  }
  let disallowLen = -1
  for (const pattern of group.disallow) {
    if (matchPath(pattern, path)) disallowLen = Math.max(disallowLen, pattern.length)
  }
  if (allowLen < 0 && disallowLen < 0) return true
  return allowLen >= disallowLen
}

export function robotsAllows(policy: RobotsPolicy, path: string): boolean {
  const target = path || '/'
  if (policy.specific) return groupAllows(policy.specific, target)
  if (policy.wildcard) return groupAllows(policy.wildcard, target)
  return true
}
