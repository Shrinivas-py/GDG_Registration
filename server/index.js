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
const app = createApp({
  repository: createRegistrationRepository({ supabase }),
  frontendOrigin,
  adminAuth: createAdminAuth({
    supabase,
    allowedEmails: parseAdminAllowlist(process.env.ADMIN_EMAIL_ALLOWLIST),
  }),
  adminAuthConfigured: Boolean(process.env.ADMIN_EMAIL_ALLOWLIST),
})
const port = Number(process.env.PORT || 3001)

const server = app.listen(port, () => console.log(`Registration API listening on port ${port}`))
server.on('error', (e) => console.error('Server error:', e.message))
server.on('close', () => console.error('Server closed'))
process.on('uncaughtException', (e) => console.error('Uncaught:', e.message))
process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e?.message || e))
process.on('exit', (code) => console.error('Process exiting with code', code))
