// Hard-coded alias map for known VC rebrands / alternate names.
// Edit this map in code (no DB table) — user preference.
const ALIASES: Record<string, string> = {
  'sequoia india': 'peak xv partners',
  'sequoia capital india': 'peak xv partners',
  'peak xv': 'peak xv partners',
  'matrix partners india': 'z47',
  'matrix partners': 'z47',
  'accel india': 'accel',
  'accel partners india': 'accel',
  'lightspeed india': 'lightspeed',
  'lightspeed venture partners india': 'lightspeed',
  'elevation capital': 'elevation capital',
  'saif partners': 'elevation capital',
  'ian group': 'ian group (indian angel network)',
  'indian angel network': 'ian group (indian angel network)',
  'ian angel fund': 'ian group (indian angel network)',
  'eight roads ventures': 'eight roads ventures (india)',
  'general catalyst': 'general catalyst (india)',
  'bessemer': 'bessemer venture partners (india)',
  'bessemer venture partners': 'bessemer venture partners (india)',
  '3one4': '3one4 capital',
  'nexus': 'nexus venture partners',
  'kalaari': 'kalaari capital',
  'blume': 'blume ventures',
  'chiratae': 'chiratae ventures',
  'endiya': 'endiya partners',
  'stellaris': 'stellaris venture partners',
  'fireside': 'fireside ventures',
  'pi ventures': 'pi ventures',
  'titan': 'titan capital',
  'inflection point': 'inflection point ventures',
  'ankur': 'ankur capital',
}

const NOISE_SUFFIXES = /\s+(partners|ventures|capital|fund|advisors|investments|group|network|angels?|vc)\s*$/i

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(NOISE_SUFFIXES, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function canonicalize(name: string): string {
  const norm = normalizeName(name)
  return ALIASES[norm] ?? name.trim()
}

export function isSameFirm(a: string, b: string): boolean {
  return canonicalize(a).toLowerCase() === canonicalize(b).toLowerCase()
}

// Dedupe an array of investor names — folds aliases to canonical names
export function dedupeInvestors(names: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>()  // canonical → all seen variants
  for (const n of names) {
    const canon = canonicalize(n)
    if (!map.has(canon)) map.set(canon, [])
    map.get(canon)!.push(n)
  }
  return map
}
