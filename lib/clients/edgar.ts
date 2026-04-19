import { cached, TTL } from '@/lib/cache'
import pLimit from 'p-limit'

export const pEdgar = pLimit(8)

type EdgarFiling = {
  file_date: string
  form_type: string
  entity_name: string
  cik: string
  accession_no: string
}

export type EdgarResult = {
  filings: EdgarFiling[]
  latest_file_date: string | null
  months_since_filing: number | null
}

export async function searchFormD(firmName: string): Promise<EdgarResult> {
  const cacheKey = `edgar:${firmName.toLowerCase()}`
  return cached('cache_edgar', cacheKey, TTL.EDGAR, async () => {
    const q = encodeURIComponent(`"${firmName}"`)
    const url = `https://efts.sec.gov/LATEST/search-index?q=${q}&dateRange=custom&startdt=2018-01-01&forms=D&hits.hits._source=file_date,form_type,entity_name,cik,accession_no`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Lumen/1.0 (otgdev2002@gmail.com)' },
    })
    if (!res.ok) return { filings: [], latest_file_date: null, months_since_filing: null }
    const data = await res.json() as { hits?: { hits?: Array<{ _source: EdgarFiling }> } }
    const filings = (data.hits?.hits ?? []).map(h => h._source)
    const sorted = [...filings].sort((a, b) =>
      new Date(b.file_date).getTime() - new Date(a.file_date).getTime()
    )
    const latest = sorted[0]?.file_date ?? null
    const monthsSince = latest
      ? Math.floor((Date.now() - new Date(latest).getTime()) / (1000 * 60 * 60 * 24 * 30))
      : null
    return { filings: sorted, latest_file_date: latest, months_since_filing: monthsSince }
  })
}
