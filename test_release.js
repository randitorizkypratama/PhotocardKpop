const extractReleaseName = (name, groupName) => {
  const n = name.toUpperCase()
  const albumPatterns = [
    [/EMPATHY/, 'EMPATHY'],
    [/REVIVe\+/, 'REVIVE+'],
    [/SECRET/, 'SECRET'],
    [/LOVED/, 'LOVED'],
    [/HEAVEN/, 'HEAVEN'],
    [/BADDIE/, 'BADDIE'],
    [/ALL.*NIGHT/, 'ALL NIGHT'],
    [/I.*AM/, 'I AM'],
    [/I.*VE.*IVE/, "I'VE IVE"],
    [/AFTER.*LIKE/, 'AFTER LIKE'],
    [/LOVE.*DIVE/, 'LOVE DIVE'],
    [/ELEVEN/, 'ELEVEN'],
  ]
  for (const [pattern, label] of albumPatterns) {
    if (pattern.test(n)) return label
  }
  return null
}

const tests = [
  ['Ive Love Dive Sound Wave Luckydraw', 'IVE'],
  ['IVE EMPATHY STUDIO CHOOM', 'IVE'],
  ['REVIVE+ KTOWN4U', 'IVE'],
  ['After LIKE VER.3', 'IVE'],
  ['Ive Eleven Sound Wave Luckydraw', 'IVE'],
  ['REVIVE+ LOVED IVE ver.', 'IVE'],
  ['Ive SECRET WITHMUU LUCKY DRAW', 'IVE'],
  ['I\'ve IVE WITHMUU', 'IVE'],
]

tests.forEach(([name, group]) => {
  console.log(name, '->', extractReleaseName(name, group))
})