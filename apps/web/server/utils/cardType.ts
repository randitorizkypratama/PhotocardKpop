export function inferCardType(name: string): string {
  const n = name.toUpperCase()
  
  if (n.includes('LUCKY DRAW')) return 'Lucky Draw'
  if (n.includes('MD VER') || n.includes(' MD ') || n.includes('MD SET')) return 'MD'
  if (n.includes('DIGIPACK')) return 'Album'
  if (n.includes('FANMEETING') || n.includes('FAN MEETING') || n.includes('FAN CERT')) return 'Fan Meeting'
  if (n.includes('WITHMUU') || n.includes('APPLEMUSIC') || n.includes('MAKESTAR') || 
      n.includes('INTERASIA') || n.includes('SOUNDWAVE') || n.includes('KTOWN4U') ||
      n.includes('EVERLINE') || n.includes('MINIRECORD') || n.includes('MUSICART')) return 'POB'
  if (n.includes('SEASON')) return "Season's Greetings"
  if (n.includes('CONCERT') || n.includes('WORLD TOUR') || n.includes('LIVE')) return 'Concert'
  if (n.includes('RANDOM TRADING CARD') || n.includes('TRADING CARD SET')) return 'Trading Card'
  if (n.includes('POP-UP') || n.includes('POP UP')) return 'Pop-up'
  if (n.includes('FANCLUB') || n.includes('FAN CLUB') || n.includes('FAN KIT')) return 'Fan Club'
  if (n.includes('CHRISTMAS') || n.includes('HOLIDAY')) return 'Special'
  if (n.includes('PINK') || n.includes('GOLDEN')) return 'Special'
  if (n.includes('T-SHIRT') || n.includes('SHIRT')) return 'MD'
  
  return 'Album'
}
