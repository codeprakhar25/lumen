// Step 7: Discover partners via Crustdata /person/search
import { personSearch, pCrustdata } from '@/lib/clients/crustdata'
import type { Partner } from '@/lib/types'
import { env } from '@/lib/env'

export async function discoverPartners(
  firmName: string,
  founder_sector: string
): Promise<Partner[]> {
  const persons = await pCrustdata(() =>
    personSearch(firmName, `partners:${firmName}`)
  )

  return persons.slice(0, env.MAX_PARTNERS_PER_FIRM).map(p => {
    const currentRole = p.experience?.employment_details?.current?.[0]
    const prevRoles = p.experience?.employment_details?.past?.slice(0, 3) ?? []
    const linkedinUrl = p.social_handles?.professional_network_identifier?.profile_url ?? null
    const schools = p.education?.schools ?? []

    return {
      name: p.basic_profile.name,
      firm: firmName,
      title: currentRole?.title ?? 'Partner',
      linkedin_url: linkedinUrl,
      background: {
        previous_roles: prevRoles.map(r => ({
          company: r.name,
          title: r.title,
          years: r.start_date && r.end_date
            ? `${r.start_date.slice(0, 4)}–${r.end_date.slice(0, 4)}`
            : undefined,
        })),
        education: schools.map(e => `${e.school}${e.degree ? ` – ${e.degree}` : ''}`),
        notable_investments: [],
        domains_of_focus: [founder_sector],
      },
      affinity_signals: {
        sector_experience: false,
        operator_background_in_sector: false,
        invested_in_competitor: false,
        similar_founder_profile_backed: false,
      },
      recent_signal: null,
    }
  })
}
