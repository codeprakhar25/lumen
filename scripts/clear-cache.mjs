import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data: rows, error: sErr } = await supabase
  .from('founder_runs')
  .select('analysis_id, input, status')
  .in('status', ['complete', 'error', 'pending'])

if (sErr) { console.error(sErr); process.exit(1) }
console.log(`Found ${rows.length} cached/stale rows`)

const { error: dErr } = await supabase
  .from('founder_runs')
  .delete()
  .in('status', ['complete', 'error', 'pending'])

if (dErr) { console.error(dErr); process.exit(1) }
console.log(`Deleted ${rows.length} rows`)
