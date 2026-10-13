import crypto from 'node:crypto'
import { ticketReference } from './ticket.js'

function emailKey(email) {
  const [local, domain] = email.split('@')
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.split('+')[0].replaceAll('.', '')}@gmail.com`
  }
  return email
}

function hashRecoveryToken(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

export function createRegistrationRepository({ supabase }) {
  return {
    async getAdminDashboard() {
      const { count: total, error: totalError } = await supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
      if (totalError) throw totalError
      const { count: checkedIn, error: checkedInError } = await supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('checked_in', true)
      if (checkedInError) throw checkedInError
      const { data: recent, error: recentError } = await supabase
        .from('registrations')
        .select('name, sr_no, fallback_id, checked_in_at')
        .eq('checked_in', true)
        .order('checked_in_at', { ascending: false })
        .limit(10)
      if (recentError) throw recentError
      const totalValue = total || 0
      const checkedInValue = checkedIn || 0
      return {
        total: totalValue,
        checked_in: checkedInValue,
        remaining: Math.max(0, totalValue - checkedInValue),
        attendance_percentage: totalValue === 0 ? 0 : Math.round((checkedInValue / totalValue) * 10000) / 100,
        recent_checkins: recent || [],
      }
    },

    async lookupAdminAttendee({ token, fallbackId, ticketReference: reference, usn }) {
      let query = supabase
        .from('registrations')
        .select('id, name, sr_no, usn, branch, year, fallback_id, qr_token, checked_in, checked_in_at')
        .limit(2)
      if (token) query = query.eq('qr_token', token)
      else if (Number.isInteger(fallbackId)) query = query.eq('fallback_id', fallbackId)
      else if (usn) query = query.eq('usn', usn)
      else if (reference) query = query.ilike('qr_token', `${reference.slice(4)}%`)
      const { data, error } = await query
      if (error) throw error
      if (!data?.length) return { kind: 'not_found' }
      if (data.length > 1) return { kind: 'ambiguous' }
      const attendee = data[0]
      return {
        kind: 'found',
        attendee: {
          id: attendee.id,
          name: attendee.name,
          sr_no: attendee.sr_no,
          usn: attendee.usn,
          branch: attendee.branch,
          year: attendee.year,
          fallback_id: attendee.fallback_id,
          checked_in: attendee.checked_in,
          checked_in_at: attendee.checked_in_at,
        },
        internalId: attendee.id,
      }
    },

    async getAdminTicket(input) {
      const result = await this.lookupAdminAttendee(input)
      if (result.kind !== 'found') return result
      const { data, error } = await supabase
        .from('registrations')
        .select('id, name, sr_no, usn, branch, year, fallback_id, qr_token')
        .eq('id', result.internalId)
        .single()
      if (error) throw error
      return {
        kind: 'found',
        ticket: {
          token: data.qr_token,
          reference: ticketReference(data.qr_token),
          participant: {
            name: data.name,
            sr_no: data.sr_no,
            usn: data.usn,
            branch: data.branch,
            year: data.year,
            fallback_id: data.fallback_id,
          },
        },
      }
    },

    async recoverTicketBySrNo(srNo) {
      const { data, error } = await supabase
        .from('registrations')
        .select('name, sr_no, usn, branch, year, fallback_id, qr_token')
        .eq('sr_no', srNo)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        token: data.qr_token,
        reference: ticketReference(data.qr_token),
        participant: {
          name: data.name,
          sr_no: data.sr_no,
          usn: data.usn,
          branch: data.branch,
          year: data.year,
          fallback_id: data.fallback_id,
        },
      }
    },

    async checkInAdminAttendee(registrationId) {
      const checkedInAt = new Date().toISOString()
      const { data, error } = await supabase
        .from('registrations')
        .update({ checked_in: true, checked_in_at: checkedInAt })
        .eq('id', registrationId)
        .eq('checked_in', false)
        .is('checked_in_at', null)
        .select('id, name, sr_no, usn, branch, year, fallback_id, checked_in, checked_in_at')
        .maybeSingle()
      if (error) throw error
      if (data) return { kind: 'checked_in', attendee: data }
      const existing = await supabase
        .from('registrations')
        .select('id, name, sr_no, usn, branch, year, fallback_id, checked_in, checked_in_at')
        .eq('id', registrationId)
        .maybeSingle()
      if (existing.error) throw existing.error
      if (!existing.data) return { kind: 'not_found' }
      return { kind: 'already_checked_in', attendee: existing.data }
    },

    async listAdminAttendees({ page, pageSize, search, checkedIn }) {
      let query = supabase
        .from('registrations')
        .select('id, name, sr_no, usn, email, branch, year, qr_token, fallback_id, checked_in, checked_in_at, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (search) query = query.or(`name.ilike.%${search}%,sr_no.ilike.%${search}%,usn.ilike.%${search}%,email.ilike.%${search}%`)
      if (checkedIn !== undefined) query = query.eq('checked_in', checkedIn)
      const { data, count, error } = await query
      if (error) throw error
      return {
        attendees: (data || []).map((row) => ({
          id: row.id,
          name: row.name,
          sr_no: row.sr_no,
          usn: row.usn,
          email: row.email,
          branch: row.branch,
          year: row.year,
          ticket_reference: ticketReference(row.qr_token),
          fallback_id: row.fallback_id,
          checked_in: row.checked_in,
          checked_in_at: row.checked_in_at,
          created_at: row.created_at,
        })),
        total: count || 0,
      }
    },

    async exportAdminAttendees({ search, checkedIn, limit = 50000 }) {
      let query = supabase
        .from('registrations')
        .select('name, sr_no, usn, email, branch, year, qr_token, fallback_id, checked_in, checked_in_at, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (search) query = query.or(`name.ilike.%${search}%,sr_no.ilike.%${search}%,usn.ilike.%${search}%,email.ilike.%${search}%`)
      if (checkedIn !== undefined) query = query.eq('checked_in', checkedIn)
      const { data, error } = await query
      if (error) throw error
      return (data || []).map((row) => ({
        name: row.name,
        sr_no: row.sr_no,
        usn: row.usn || '',
        email: row.email,
        branch: row.branch,
        year: row.year,
        ticket_reference: ticketReference(row.qr_token),
        fallback_id: row.fallback_id,
        checked_in: row.checked_in ? 'Yes' : 'No',
        checked_in_at: row.checked_in_at || '',
        registered_at: row.created_at,
      }))
    },

    async createRegistration(registration) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
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
          .select('id, qr_token, fallback_id, email, created_at')
          .single()

        if (!error) return data
        const isFallbackCollision = error.code === '23505' && error.constraint === 'registrations_fallback_id_key'
        if (!isFallbackCollision || attempt === 3) throw error
      }
      throw new Error('Fallback ID allocation failed.')
    },

    async createRecoveryToken(email, secret, expiresAt) {
      const { data: registration, error: lookupError } = await supabase
        .from('registrations')
        .select('id, name, sr_no, usn, branch, year, fallback_id, qr_token, email')
        .eq('email_key', emailKey(email))
        .maybeSingle()
      if (lookupError) throw lookupError
      if (!registration) return null

      const { error } = await supabase
        .from('ticket_recovery_tokens')
        .insert({
          registration_id: registration.id,
          token_hash: hashRecoveryToken(secret),
          expires_at: expiresAt,
        })
      if (error) throw error
      return registration
    },

    async consumeRecoveryToken(secret) {
      const { data, error } = await supabase
        .from('ticket_recovery_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('token_hash', hashRecoveryToken(secret))
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .select('registration:registrations(id, name, sr_no, usn, branch, year, fallback_id, qr_token, email)')
        .maybeSingle()
      if (error) throw error
      return data?.registration || null
    },
  }
}
