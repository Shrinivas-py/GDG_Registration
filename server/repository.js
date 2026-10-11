export function createRegistrationRepository({ supabase }) {
  return {
    async resolveCanonicalSrNo(identifier) {
      const { data: usnMatch, error: usnError } = await supabase
        .schema('public')
        .from('student_identifier_map')
        .select('sr_no')
        .eq('usn', identifier)
        .maybeSingle()

      if (usnError) {
        usnError.table = 'student_identifier_map'
        throw usnError
      }
      if (usnMatch?.sr_no) return usnMatch.sr_no

      const { data: srNoMatch, error: srNoError } = await supabase
        .schema('public')
        .from('student_identifier_map')
        .select('sr_no')
        .eq('sr_no', identifier)
        .maybeSingle()

      if (srNoError) {
        srNoError.table = 'student_identifier_map'
        throw srNoError
      }
      return srNoMatch?.sr_no || null
    },
    async insert(registration) {
      const { data, error } = await supabase
        .schema('public')
        .from('registrations')
        .insert({
          name: registration.name,
          usn_or_srno: registration.usnOrSrno,
          canonical_sr_no: registration.canonicalSrNo,
          email: registration.email,
          branch: registration.branch,
          year: registration.year,
        })
        .select('id, created_at')
        .single()

      if (error) throw error
      return data
    },
  }
}
