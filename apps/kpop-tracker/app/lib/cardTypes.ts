export interface CardTypeInfo {
  /** Canonical label used in the interface */
  label: string
  /** Short factual description used by the "What is this?" section */
  blurb: string
}

const INFO: Record<string, CardTypeInfo> = {
  Album: {
    label: 'Album PC',
    blurb:
      'An Album PC is a photocard included inside a studio album or album package. It is part of the standard release and is obtained by purchasing the album.',
  },
  POB: {
    label: 'POB',
    blurb:
      'A POB (Pre-Order Benefit) is a photocard distributed as a bonus during an album pre-order period. Each store or platform usually issues its own POB version.',
  },
  'Lucky Draw': {
    label: 'Lucky Draw',
    blurb:
      'A Lucky Draw card is a photocard given out through an event where eligible orders are entered into a draw. Availability is limited to the event period.',
  },
  MD: {
    label: 'MD',
    blurb:
      'An MD card is a photocard sold as part of official merchandise, such as a pop-up store item, tour goods, or a fan kit.',
  },
  'Fan Meeting': {
    label: 'Fan Meeting',
    blurb:
      'A Fan Meeting card is a photocard distributed at or related to a fan meeting event, often as an attendance or participation benefit.',
  },
  "Season's Greetings": {
    label: "Season's Greetings",
    blurb:
      "A Season's Greetings card is a photocard included with a seasonal calendar or diary set released once a year.",
  },
  Concert: {
    label: 'Concert',
    blurb:
      'A Concert card is a photocard connected to a concert or world tour, such as a venue benefit, merch purchase reward, or event handout.',
  },
  'Trading Card': {
    label: 'Trading Card',
    blurb:
      'A Trading Card is a photocard released as part of an official trading card set rather than an album or event benefit.',
  },
  'Pop-up': {
    label: 'Pop-up',
    blurb:
      'A Pop-up card is a photocard issued through a temporary pop-up store or brand activation during its operating period.',
  },
  'Fan Club': {
    label: 'Fan Club',
    blurb:
      'A Fan Club card is a photocard included with an official fan club membership kit or renewal benefit.',
  },
  Fansign: {
    label: 'Fansign',
    blurb:
      'A Fansign card is a photocard obtained through an album purchase that enters the buyer into a fansign or video call event.',
  },
  Broadcast: {
    label: 'Broadcast',
    blurb:
      'A Broadcast card is a photocard released through a TV music show broadcast, usually given as an attendance or participation benefit.',
  },
  Event: {
    label: 'Event',
    blurb:
      'An Event card is a photocard distributed through a specific promotion, raffle, or limited-time event.',
  },
}

/** Types shown on the homepage "Explore by card type" section. */
export const FEATURED_CARD_TYPES = [
  'Album',
  'POB',
  'Lucky Draw',
  'MD',
  'Fan Meeting',
  'Concert',
] as const

export function cardTypeInfo(type?: string | null): CardTypeInfo | null {
  if (!type) return null
  return INFO[type] ?? null
}

export function cardTypeLabel(type?: string | null): string {
  if (!type) return ''
  return INFO[type]?.label ?? type
}

export function cardTypeBlurb(type?: string | null): string | null {
  if (!type) return null
  return INFO[type]?.blurb ?? null
}
