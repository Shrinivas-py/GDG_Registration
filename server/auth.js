function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export function parseAdminAllowlist(value) {
  return new Set(
    (value || '')
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean),
  )
}

function bearerToken(request) {
  const header = request.get('authorization') || ''
  const match = /^Bearer ([^\s]+)$/.exec(header)
  return match?.[1] || ''
}

export function createAdminAuth({ supabase, allowedEmails = new Set(), verifyUser } = {}) {
  const verify = verifyUser || (async (token) => {
    if (!supabase?.auth?.getUser) return null
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user
  })

  return async function requireAdmin(request, response, next) {
    const token = bearerToken(request)
    if (!token) {
      console.warn('Admin authentication rejected: missing bearer token.')
      return response.status(401).json({ success: false, message: 'Authentication is required.' })
    }

    try {
      const user = await verify(token)
      const email = normalizeEmail(user?.email)
      if (!user || !email || !allowedEmails.has(email)) {
        console.warn('Admin authentication rejected: invalid or unauthorized identity.')
        return response.status(403).json({ success: false, message: 'You are not authorized to access the admin portal.' })
      }
      request.adminUser = { id: user.id, email }
      return next()
    } catch {
      console.warn('Admin authentication rejected: token verification failed.')
      return response.status(401).json({ success: false, message: 'Authentication is invalid or expired.' })
    }
  }
}
