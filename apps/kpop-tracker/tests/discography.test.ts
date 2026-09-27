import { describe, expect, it } from 'vitest'
import type { DiscographyRelease } from '../server/utils/releases/discography'
import {
  buildReleaseMatchIndex,
  canonicalizeReleaseToken,
  discographyKey,
  matchReleaseForCard,
  mergeReleaseGroups,
  resolveCardReleaseSync,
  stripVersionSuffix,
} from '../server/utils/releases/discography'

function rel(group: string, title: string): DiscographyRelease {
  return {
    group_name: group,
    title,
    key: discographyKey(title),
    release_type: 'Single',
    release_date: '2024-01-01',
    mbid: null,
  }
}

function rg(
  title: string,
  date?: string,
  opts: { type?: string, secondary?: string[], id?: string } = {},
) {
  return {
    title,
    'primary-type': opts.type ?? 'Single',
    'secondary-types': opts.secondary ?? [],
    'first-release-date': date,
    id: opts.id,
  }
}

describe('discographyKey', () => {
  it('uppercases and collapses punctuation to spaces', () => {
    expect(discographyKey('IVE - LOVE DIVE')).toBe('IVE LOVE DIVE')
    expect(discographyKey('  synk : parallel line  ')).toBe('SYNK PARALLEL LINE')
  })

  it('drops apostrophes instead of turning them into spaces', () => {
    expect(discographyKey("I'VE MINE")).toBe('IVE MINE')
    expect(discographyKey('Lemonade’S')).toBe('LEMONADES')
  })

  it('keeps letters of any script and handles empty input', () => {
    expect(discographyKey('한글')).toBe('한글')
    expect(discographyKey(null)).toBe('')
    expect(discographyKey('   ')).toBe('')
  })
})

describe('stripVersionSuffix', () => {
  it('removes language version markers', () => {
    expect(stripVersionSuffix('ELEVEN -Japanese ver.-')).toBe('ELEVEN')
    expect(stripVersionSuffix('Whiplash (English version)')).toBe('Whiplash')
  })

  it('removes track-video and remix-style suffixes', () => {
    expect(stripVersionSuffix('Salty & Sweet (track video version)')).toBe('Salty & Sweet')
    expect(stripVersionSuffix('RIVER (Instrumental)')).toBe('RIVER')
  })

  it('removes release-format suffixes but keeps meaningful parentheses', () => {
    expect(stripVersionSuffix('LOVE DIVE - EP')).toBe('LOVE DIVE')
    expect(stripVersionSuffix('Song (prod. by X)')).toBe('Song (prod. by X)')
    expect(stripVersionSuffix('After LIKE')).toBe('After LIKE')
  })

  it('strips stacked version suffixes', () => {
    expect(stripVersionSuffix('Title (English version) (Japanese ver.)')).toBe('Title')
  })
})

describe('mergeReleaseGroups', () => {
  it('merges version siblings and keeps the earliest date', () => {
    const merged = mergeReleaseGroups('IVE', [
      rg('ELEVEN', '2021-12-01', { id: 'japanese' }),
      rg('ELEVEN -Japanese ver.-', '2021-12-01', { id: 'japanese' }),
      rg('ELEVEN', '2021-10-05', { id: 'original' }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].title).toBe('ELEVEN')
    expect(merged[0].release_date).toBe('2021-10-05')
    expect(merged[0].mbid).toBe('original')
    expect(merged[0].key).toBe(discographyKey('ELEVEN'))
  })

  it('drops compilations, lives, and other secondary exclusions', () => {
    const merged = mergeReleaseGroups('IVE', [
      rg('THE FIRST', '2022-01-01', { type: 'Compilation' }),
      rg('LIVE TOUR', '2022-01-01', { secondary: ['Live'] }),
      rg('REAL LOVE', '2022-01-01', { type: 'Album' }),
    ])
    expect(merged.map(entry => entry.title)).toEqual(['REAL LOVE'])
    expect(merged[0].release_type).toBe('Album')
  })

  it('sorts dated releases ascending with undated entries last', () => {
    const merged = mergeReleaseGroups('IVE', [
      rg('NO DATE'),
      rg('NEWER', '2024-06-01'),
      rg('OLDER', '2023-02-08'),
    ])
    expect(merged.map(entry => entry.title)).toEqual(['OLDER', 'NEWER', 'NO DATE'])
  })
})

describe('buildReleaseMatchIndex', () => {
  it('exposes the group-stripped alt key', () => {
    const index = buildReleaseMatchIndex('IVE', [rel('IVE', 'IVE SECRET')])
    expect(index).toEqual([{ title: 'IVE SECRET', key: 'IVE SECRET', altKey: 'SECRET' }])
  })

  it('drops keys shorter than four characters', () => {
    const index = buildReleaseMatchIndex('IVE', [rel('IVE', 'UP'), rel('IVE', 'WAVE')])
    expect(index.map(entry => entry.key)).toEqual(['WAVE'])
  })

  it('does not build an alt key equal to the group name', () => {
    const index = buildReleaseMatchIndex('IVE', [rel('IVE', 'IVE IVE')])
    expect(index[0].altKey).toBeNull()
  })
})

describe('matchReleaseForCard', () => {
  const index = buildReleaseMatchIndex('IVE', [
    rel('IVE', 'IVE SECRET'),
    rel('IVE', 'WAVE'),
    rel('IVE', 'SYNK : PARALLEL LINE'),
  ])

  it('matches a single-word title only at the start of the card name', () => {
    expect(matchReleaseForCard('WAVE photocard polaroid', index)).toEqual({
      title: 'WAVE',
      key: 'WAVE',
    })
    expect(matchReleaseForCard('LUCKY DRAW WAVE photo set', index)).toBeNull()
  })

  it('does not match inside a longer word', () => {
    expect(matchReleaseForCard('WAVEFORM poster', index)).toBeNull()
  })

  it('matches a multi-word title after a prefix', () => {
    const hit = matchReleaseForCard('2024 IVE CONCERT SYNK : PARALLEL LINE poster set', index)
    expect(hit?.title).toBe('SYNK : PARALLEL LINE')
  })

  it('prefers the longest match starting at the earliest position', () => {
    expect(matchReleaseForCard('IVE SECRET story photocard', index)?.title).toBe('IVE SECRET')
    // The stripped alt key "SECRET" fires at position 0 for this name.
    expect(matchReleaseForCard('SECRET STORY photocard', index)?.title).toBe('IVE SECRET')

    const storyIndex = buildReleaseMatchIndex('IVE', [
      rel('IVE', 'SECRET'),
      rel('IVE', 'SECRET STORY'),
    ])
    expect(matchReleaseForCard('SECRET STORY photocard', storyIndex)?.title).toBe('SECRET STORY')
  })
})

describe('canonicalizeReleaseToken', () => {
  const index = buildReleaseMatchIndex('IVE', [rel('IVE', 'IVE SECRET'), rel('IVE', 'WAVE')])

  it('maps a legacy token onto the discography title', () => {
    expect(canonicalizeReleaseToken('SECRET', index)).toBe('IVE SECRET')
    expect(canonicalizeReleaseToken('wave', index)).toBe('WAVE')
  })

  it('returns null for tokens outside the discography', () => {
    expect(canonicalizeReleaseToken('NOT A RELEASE', index)).toBeNull()
  })
})

describe('resolveCardReleaseSync', () => {
  const index = buildReleaseMatchIndex('IVE', [
    rel('IVE', 'IVE SECRET'),
    rel('IVE', 'WAVE'),
  ])

  it('prefers the discography title found in the card name', () => {
    expect(resolveCardReleaseSync('IVE SECRET member photocard', 'IVE', index)).toBe('IVE SECRET')
    expect(resolveCardReleaseSync('WAVE official photocard', 'IVE', index)).toBe('WAVE')
  })

  it('falls back to the legacy token and canonicalises it', () => {
    // No discography title appears at a valid position, so the token list
    // kicks in: "SECRET" → "IVE SECRET".
    const card = 'IVE OFFICIAL PHOTOCARD SECRET 3RD mini poster set'
    expect(resolveCardReleaseSync(card, 'IVE', index)).toBe('IVE SECRET')
  })

  it('returns null when nothing matches', () => {
    expect(resolveCardReleaseSync('zzz qqq xxx mystery goods', 'IVE', index)).toBeNull()
  })
})
