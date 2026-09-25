export interface ReleaseTrack {
  position: number
  title: string
}

export interface ReleaseMatch {
  title: string
  artist: string
  releaseDate?: string
  artwork?: string
  tracks?: ReleaseTrack[]
  label?: string
  source: 'musicbrainz' | 'apple'
  /** Every provider that contributed a field after merging */
  sources?: string[]
  /** 0..1 confidence of the title/artist match */
  confidence: number
  id?: string
}

export interface ReleaseProvider {
  id: 'musicbrainz' | 'apple'
  lookup(artist: string, title: string): Promise<ReleaseMatch | null>
}
