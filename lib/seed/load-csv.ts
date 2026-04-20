import { parse } from 'csv-parse/sync'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { supabase } from '@/lib/clients/supabase'

type CsvRow = Record<string, string>

// Any column shaped like `<Something>_India_Investments` is the sector count
// column. The prefix is normalized into a sector tag: Health_Care → healthtech,
// EdTech → edtech, AI → ai, SaaS → saas, etc.
const COUNT_COL_RE = /^([A-Za-z_]+)_India_Investments$/

function normalizeSectorTag(prefix: string): string {
  const p = prefix.toLowerCase().replace(/_/g, '')
  if (p.includes('health')) return 'healthtech'
  if (p.includes('edtech')) return 'edtech'
  if (p.includes('saas')) return 'saas'
  if (p === 'ai' || p.startsWith('ai')) return 'ai'
  if (p.includes('fintech')) return 'fintech'
  return p
}

// Scan the Focus column for extra tags — these supplement the sector derived
// from the CSV itself so a generalist-but-health-active fund shows up for
// either query.
const FOCUS_TAGS: Array<{ re: RegExp; tag: string }> = [
  { re: /health|medical|medtech|clinical|pharma|diagnostic|digital health/i, tag: 'healthtech' },
  { re: /edtech|education|learning|ed-?enablement|skill(ing)?|test prep/i, tag: 'edtech' },
  { re: /saas|b2b software|enterprise software|vertical saas/i, tag: 'saas' },
  { re: /\bai\b|artificial intelligence|generative|llm|ml-?native/i, tag: 'ai' },
  { re: /fintech|payments|lending|insurance|wealth/i, tag: 'fintech' },
  { re: /consumer|d2c|commerce/i, tag: 'consumer' },
  { re: /climate|clean(tech)?|renewable|ev/i, tag: 'climate' },
  { re: /deeptech|robotics|space|semiconductor/i, tag: 'deeptech' },
]

function parseCount(val: string): number | null {
  if (!val || val === 'Unknown') return null
  const m = val.match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

function parseDate(val: string): string | null {
  if (!val || val === 'Unknown') return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

async function loadOne(path: string): Promise<{ inserted: number; errors: string[]; sector: string }> {
  const content = readFileSync(path, 'utf-8')
  const rows: CsvRow[] = parse(content, { columns: true, skip_empty_lines: true, trim: true })

  const header = Object.keys(rows[0] ?? {})
  const countCol = header.find(c => COUNT_COL_RE.test(c))
  const sectorTag = countCol
    ? normalizeSectorTag(countCol.match(COUNT_COL_RE)![1])
    : 'unknown'

  const errors: string[] = []
  let inserted = 0

  for (const row of rows) {
    const name = row['VC_Firm']?.trim()
    if (!name) continue

    const focusRaw = row['Focus'] ?? ''
    const derivedTags = new Set<string>([sectorTag])
    for (const { re, tag } of FOCUS_TAGS) {
      if (re.test(focusRaw)) derivedTags.add(tag)
    }

    const knownCols = new Set([
      'VC_Firm', 'Sector', 'Focus', 'Last_Investment',
      'Last_Investment_Company', 'Notes', countCol ?? '',
    ])
    const extraFields: Record<string, string> = {}
    for (const [k, v] of Object.entries(row)) {
      if (!knownCols.has(k) && v) extraFields[k] = v
    }
    const notesStr = [
      row['Notes'] ?? '',
      Object.keys(extraFields).length ? JSON.stringify(extraFields) : '',
    ].filter(Boolean).join(' | ')

    const record = {
      name,
      sector: row['Sector'] ?? null,
      sector_tags: [...derivedTags],
      // Column is historically named `healthtech_investment_count` but now
      // stores the sector-specific count from whichever CSV sourced the row.
      healthtech_investment_count: parseCount(row[countCol ?? ''] ?? ''),
      last_investment_date: parseDate(row['Last_Investment'] ?? ''),
      last_investment_company: row['Last_Investment_Company']?.trim() || null,
      notes: notesStr || null,
    }

    const { error } = await supabase
      .from('vc_firms')
      .upsert(record, { onConflict: 'name' })

    if (error) errors.push(`${name}: ${error.message}`)
    else inserted++
  }

  return { inserted, errors, sector: sectorTag }
}

export async function loadCsv(csvPath?: string): Promise<{
  inserted: number
  errors: string[]
  by_sector: Record<string, number>
}> {
  const dataDir = join(process.cwd(), 'data')
  const files = csvPath
    ? [csvPath]
    : readdirSync(dataDir)
        .filter(f => /^india_.+_vcs\.csv$/i.test(f))
        .map(f => join(dataDir, f))

  const bySector: Record<string, number> = {}
  const errors: string[] = []
  let total = 0

  for (const path of files) {
    const r = await loadOne(path)
    total += r.inserted
    bySector[r.sector] = (bySector[r.sector] ?? 0) + r.inserted
    errors.push(...r.errors)
  }

  return { inserted: total, errors, by_sector: bySector }
}
