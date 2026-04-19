import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { join } from 'path'
import { supabase } from '@/lib/clients/supabase'

type CsvRow = Record<string, string>

function parseHealthCount(val: string): number | null {
  if (!val || val === 'Unknown') return null
  // Handle values like "~14 total; ~7 India" or "~2–3 India healthcare"
  const match = val.match(/\d+/)
  return match ? parseInt(match[0], 10) : null
}

function parseDate(val: string): string | null {
  if (!val || val === 'Unknown') return null
  // Handle "Feb 2026", "Sep 2024", "Mar 2026", "Apr 2025" etc.
  const d = new Date(val)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function parseFocus(val: string): string[] {
  if (!val || val === 'Unknown') return []
  return val.split(';').map(s => s.trim()).filter(Boolean)
}

export async function loadCsv(csvPath?: string): Promise<{ inserted: number; errors: string[] }> {
  const path = csvPath ?? join(process.cwd(), 'data', 'india_healthtech_vcs.csv')
  const content = readFileSync(path, 'utf-8')
  const rows: CsvRow[] = parse(content, { columns: true, skip_empty_lines: true, trim: true })

  const errors: string[] = []
  let inserted = 0

  for (const row of rows) {
    const name = row['VC_Firm']?.trim()
    if (!name) continue

    const focusRaw = row['Focus'] ?? ''
    const sectorTags: string[] = []
    if (/health/i.test(focusRaw)) sectorTags.push('healthtech')
    if (/consumer/i.test(focusRaw)) sectorTags.push('consumer_health')
    if (/medtech|medical device/i.test(focusRaw)) sectorTags.push('medtech')
    if (/ai|artificial intelligence/i.test(focusRaw)) sectorTags.push('ai')
    if (/diagnostic/i.test(focusRaw)) sectorTags.push('diagnostics')
    if (/pharma|pharmacy/i.test(focusRaw)) sectorTags.push('pharma')
    if (/digital health/i.test(focusRaw)) sectorTags.push('digital_health')

    // Preserve any unknown columns as JSON in notes
    const knownCols = new Set(['VC_Firm', 'Sector', 'Health_Care_India_Investments', 'Focus', 'Last_Investment', 'Last_Investment_Company', 'Notes'])
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
      sector_tags: sectorTags.length ? sectorTags : ['healthtech'],
      healthtech_investment_count: parseHealthCount(row['Health_Care_India_Investments'] ?? ''),
      last_investment_date: parseDate(row['Last_Investment'] ?? ''),
      last_investment_company: row['Last_Investment_Company']?.trim() || null,
      notes: notesStr || null,
    }

    const { error } = await supabase
      .from('vc_firms')
      .upsert(record, { onConflict: 'name' })

    if (error) {
      errors.push(`${name}: ${error.message}`)
    } else {
      inserted++
    }
  }

  return { inserted, errors }
}
