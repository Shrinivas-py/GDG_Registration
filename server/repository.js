export function createRegistrationRepository({ supabase }) {
  return {
    async createRegistration(registration) {
      const { data, error } = await supabase
        .from('registrations')
        .insert({
          name: registration.name,
          sr_no: registration.sr_no,
          usn: registration.usn,
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
