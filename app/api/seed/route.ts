import { NextRequest } from 'next/server'
import { loadCsv } from '@/lib/seed/load-csv'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-seed-secret')
  if (secret !== 'lumen-seed-2026') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await loadCsv()
    return Response.json({ ok: true, ...result })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
