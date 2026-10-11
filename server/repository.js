export function createRegistrationRepository({ supabase }) {
  return {
    async createRegistration(registration) {
      const { data, error } = await supabase.rpc('create_registration', {
        p_name: registration.name,
        p_usn_or_srno: registration.usnOrSrno,
        p_email: registration.email,
        p_branch: registration.branch,
        p_year: registration.year,
      })

      if (error) throw error
      return Array.isArray(data) ? data[0] : data
    },
  }
}
