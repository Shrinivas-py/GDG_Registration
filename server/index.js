import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { createApp } from './app.js'
import { createRegistrationRepository } from './repository.js'
import { createAdminAuth, parseAdminAllowlist } from './auth.js'

const required = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY']
const missing = required.filter((name) => !process.env[name])
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`)
  process.exit(1)
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const positiveInteger = (value, fallback) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
const rateLimitWindowMs = positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
const trustProxy = process.env.TRUST_PROXY === 'true'
  ? true
  : process.env.TRUST_PROXY === 'false' || !process.env.TRUST_PROXY
    ? false
    : positiveInteger(process.env.TRUST_PROXY, 0)
const app = createApp({
  repository: createRegistrationRepository({ supabase }),
  frontendOrigin,
  adminAuth: createAdminAuth({
    supabase,
    allowedEmails: parseAdminAllowlist(process.env.ADMIN_EMAIL_ALLOWLIST),
  }),
  adminAuthConfigured: Boolean(process.env.ADMIN_EMAIL_ALLOWLIST),
  trustProxy,
  rateLimits: {
    registrationLimit: positiveInteger(process.env.REGISTRATION_RATE_LIMIT, 300),
    registrationWindowMs: positiveInteger(process.env.REGISTRATION_RATE_WINDOW_MS, rateLimitWindowMs),
    recoveryLimit: positiveInteger(process.env.RECOVERY_RATE_LIMIT, 5),
    recoveryWindowMs: positiveInteger(process.env.RECOVERY_RATE_WINDOW_MS, rateLimitWindowMs),
    adminLoginLimit: positiveInteger(process.env.ADMIN_LOGIN_RATE_LIMIT, 10),
    adminLoginWindowMs: positiveInteger(process.env.ADMIN_LOGIN_RATE_WINDOW_MS, rateLimitWindowMs),
    adminSessionLimit: positiveInteger(process.env.ADMIN_SESSION_RATE_LIMIT, 120),
    adminSessionWindowMs: positiveInteger(process.env.ADMIN_SESSION_RATE_WINDOW_MS, rateLimitWindowMs),
    checkInLimit: positiveInteger(process.env.CHECK_IN_RATE_LIMIT, 600),
    checkInWindowMs: positiveInteger(process.env.CHECK_IN_RATE_WINDOW_MS, rateLimitWindowMs),
    exportLimit: positiveInteger(process.env.ADMIN_EXPORT_RATE_LIMIT, 30),
    exportWindowMs: positiveInteger(process.env.ADMIN_EXPORT_RATE_WINDOW_MS, rateLimitWindowMs),
  },
})
const port = Number(process.env.PORT || 3001)

const server = app.listen(port, () => console.log(`Registration API listening on port ${port}`))
server.on('error', (e) => console.error('Server error:', e.message))
server.on('close', () => console.error('Server closed'))
process.on('uncaughtException', (e) => console.error('Uncaught:', e.message))
process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e?.message || e))
process.on('exit', (code) => console.error('Process exiting with code', code))
