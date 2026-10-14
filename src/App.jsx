import { useEffect, useRef, useState } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronDown, QrCode, ShieldCheck, Users } from 'lucide-react'
import QRCode from 'qrcode'
import QrScanner from 'qr-scanner'
import { jsPDF } from 'jspdf'
import gdgMark from './assets/image1.jpeg'
import chapterInfo from './assets/image2.jpeg'
import gdgInfo from './assets/image3.jpeg'
import chapterBrand from './assets/image4.jpeg'
import { normalizeSrNo, normalizeUsn, validateSrNo, validateUsn } from '../shared/identifierValidation.js'
import { supabaseAuth } from './adminAuth.js'
import { ADMIN_PATH, LEGACY_ADMIN_PATH } from './adminRoute.js'
import { CalendarDays, MapPin, Clock } from 'lucide-react'

const branches = ['CSE', 'ISE', 'CSE(AIML)', 'ECE', 'EIE', 'RA', 'MECH', 'CIV']
const years = ['1st Year', '2nd Year', '3rd Year', '4th Year']
function Footer() {
  return <footer className="footer"><div className="container footer-inner"><img className="footer-mark" src={gdgMark} alt="Google Developer Group four-color mark" /><p>Student registration for GDG Chapter 2.0.</p></div></footer>
}

function Field({ label, required, hint, error, children }) {
  return <div className={error ? 'field has-error' : 'field'}>
    <div className="field-label"><label>{label} {required && <span className="required">*</span>}</label>{hint && <span>{hint}</span>}</div>
    {children}
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = dataUrl
  })
}

async function downloadTicketPng(ticket, qrDataUrl) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 720
  const context = canvas.getContext('2d')
  context.fillStyle = '#f4f7fb'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#ffffff'
  context.fillRect(48, 48, canvas.width - 96, canvas.height - 96)
  context.fillStyle = '#16324f'
  context.font = 'bold 42px Arial'
  context.fillText('GDG Chapter 2.0', 96, 130)
  context.fillStyle = '#62748a'
  context.font = '24px Arial'
  context.fillText('Registration ticket', 96, 175)
  context.fillStyle = '#16324f'
  context.font = 'bold 30px Arial'
  context.fillText(ticket.participant.name, 96, 270)
  context.fillText(`Participant ID: ${ticket.participant.fallback_id}`, 96, 310)
  context.font = '24px Arial'
  context.fillText(`Sr. No.: ${ticket.participant.sr_no}`, 96, 350)
  context.fillText(`Branch: ${ticket.participant.branch}`, 96, 390)
  context.fillText(`Year: ${ticket.participant.year}`, 96, 430)
  if (ticket.participant.usn) context.fillText(`USN: ${ticket.participant.usn}`, 96, 470)
  context.fillStyle = '#62748a'
  context.font = '20px Arial'
  context.fillText(`Ticket reference: ${ticket.reference}`, 96, 540)
  const qrImage = await loadImage(qrDataUrl)
  context.drawImage(qrImage, 790, 145, 290, 290)
  context.fillText('Keep this ticket for event check-in.', 790, 485)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Ticket PNG could not be generated.')
  downloadBlob(blob, `${ticket.reference}.png`)
}

async function downloadTicketPdf(ticket, qrDataUrl) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  pdf.setFillColor(244, 247, 251)
  pdf.rect(0, 0, 210, 297, 'F')
  pdf.setFillColor(255, 255, 255)
  pdf.roundedRect(16, 20, 178, 257, 5, 5, 'F')
  pdf.setTextColor(22, 50, 79)
  pdf.setFontSize(24)
  pdf.setFont('helvetica', 'bold')
  pdf.text('GDG Chapter 2.0', 28, 48)
  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(98, 116, 138)
  pdf.text('Registration ticket', 28, 58)
  pdf.setTextColor(22, 50, 79)
  pdf.setFontSize(17)
  pdf.setFont('helvetica', 'bold')
  pdf.text(ticket.participant.name, 28, 82)
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Participant ID: ${ticket.participant.fallback_id}`, 28, 94)
  pdf.text(`Sr. No.: ${ticket.participant.sr_no}`, 28, 104)
  pdf.text(`Branch: ${ticket.participant.branch}`, 28, 114)
  pdf.text(`Year: ${ticket.participant.year}`, 28, 124)
  if (ticket.participant.usn) pdf.text(`USN: ${ticket.participant.usn}`, 28, 134)
  pdf.addImage(qrDataUrl, 'PNG', 62, 145, 86, 86)
  pdf.setTextColor(98, 116, 138)
  pdf.setFontSize(11)
  pdf.text(`Ticket reference: ${ticket.reference}`, 28, 250)
  pdf.text('Keep this ticket for event check-in.', 28, 260)
  pdf.save(`${ticket.reference}.pdf`)
}

function TicketConfirmation({ ticket, qrDataUrl, onDownloadPng, onDownloadPdf }) {
  const [downloadError, setDownloadError] = useState('')
  const download = async (action) => {
    setDownloadError('')
    try {
      await action()
    } catch {
      setDownloadError('The ticket download could not be prepared. Please try again.')
    }
  }
  return <main className="preview-page"><div className="container preview-wrap">
    <QrCode size={38} />
    <p className="kicker">Registration confirmed</p>
    <h1>Your ticket is ready.</h1>
    <p className="ticket-reference">Ticket reference: <strong>{ticket.reference}</strong></p>
    <div className="ticket-card">
      <div>
        <h2>{ticket.participant.name}</h2>
        <p>Participant ID: <strong>{ticket.participant.fallback_id}</strong></p>
        <p>Sr. No.: {ticket.participant.sr_no}</p>
        {ticket.participant.usn && <p>USN: {ticket.participant.usn}</p>}
        <p>{ticket.participant.branch} · {ticket.participant.year}</p>
      </div>
      {qrDataUrl && <img className="ticket-qr" src={qrDataUrl} alt={`QR ticket for ${ticket.reference}`} />}
    </div>
    <p className="ticket-note">Save this ticket and present the QR code at check-in.</p>
    <div className="ticket-actions">
      <button className="button" type="button" onClick={() => download(onDownloadPng)} disabled={!qrDataUrl}>Download PNG</button>
      <button className="button" type="button" onClick={() => download(onDownloadPdf)} disabled={!qrDataUrl}>Download PDF</button>
    </div>
    {downloadError && <p className="error-text" role="alert">{downloadError}</p>}
  </div></main>
}

function RegistrationPage() {
  const [form, setForm] = useState({ name: '', sr_no: '', usn: '', branch: '', year: '', email: '', honeypot: '' })
  const [errors, setErrors] = useState({})
  const [submitState, setSubmitState] = useState('idle')
  const [submitMessage, setSubmitMessage] = useState('')
  const [ticket, setTicket] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: '' }))
    if (submitState !== 'idle') setSubmitState('idle')
    setSubmitMessage('')
  }
  const validate = () => {
    const next = {}
    if (!form.name.trim()) next.name = 'Please enter your full name.'
    const srNoError = validateSrNo(normalizeSrNo(form.sr_no))
    if (srNoError) next.sr_no = srNoError
    const usnError = validateUsn(normalizeUsn(form.usn))
    if (usnError) next.usn = usnError
    if (!form.branch) next.branch = 'Please choose your branch.'
    if (!form.year) next.year = 'Please choose your year.'
    if (!form.email.trim()) next.email = 'Please enter your email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email address.'
    setErrors(next)
    return Object.keys(next).length === 0
  }
  const submit = async (event) => {
    event.preventDefault()
    if (!validate()) return
    setSubmitState('loading')
    setSubmitMessage('')
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.status === 201) {
        if (!payload.ticket?.qr_data_url || !payload.ticket?.reference || !payload.ticket?.participant) {
          throw new Error('The registration response did not include a ticket.')
        }
        setTicket(payload.ticket)
        setQrDataUrl(payload.ticket.qr_data_url)
        setSubmitState('success')
        setSubmitMessage('Your registration has been saved successfully.')
      } else if (response.status === 400) {
        setSubmitState('error')
        const serverErrors = payload.errors || {}
        setErrors((current) => ({ ...current, ...serverErrors }))
        setSubmitMessage(payload.message || 'Please correct the highlighted fields.')
      } else if (response.status === 409) {
        setSubmitState('error')
        setSubmitMessage(payload.message || 'This email, USN, or Sr. No. is already registered.')
      } else if (response.status === 429) {
        setSubmitState('error')
        setSubmitMessage(payload.message || 'Too many attempts. Please try again later.')
      } else {
        setSubmitState('error')
        setSubmitMessage(payload.message || 'Registration could not be saved. Please try again later.')
      }
    } catch {
      setSubmitState('error')
      setSubmitMessage('The registration service could not be reached. Please try again later.')
    }
  }
  if (submitState === 'success' && ticket) {
    return <TicketConfirmation
      ticket={ticket}
      qrDataUrl={qrDataUrl}
      onDownloadPng={() => downloadTicketPng(ticket, qrDataUrl)}
      onDownloadPdf={() => downloadTicketPdf(ticket, qrDataUrl)}
    />
  }
  return <><main className="registration-page" id="registration"><div className="container registration-layout">
    <section className="registration-intro">
      <img className="chapter-brand" src={chapterBrand} alt="Google Developer Group, JSS Academy of Technical Education, Bengaluru" />
      <p className="kicker">GDG Chapter 2.0</p>
      <h1>Bring your<br /><em>curiosity.</em></h1>
      <p style={{ color: '#5f6368', fontSize: 18, lineHeight: 1.7, margin: 0 }}>
  We're beginning a new tenure with GDG Chapter 2.0, and we're kicking it off with a peer talk by our lead. Register below to reserve your spot.
</p>

<div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12, color: '#5f6368', fontSize: 16 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <CalendarDays size={20} color="#1a73e8" />
    <span><strong style={{ color: '#202124' }}>Date:</strong> 16th October 2026</span>
  </div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <MapPin size={20} color="#1a73e8" />
    <span><strong style={{ color: '#202124' }}>Venue:</strong> Sem Hall 1</span>
  </div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <Clock size={20} color="#1a73e8" />
    <span><strong style={{ color: '#202124' }}>Time:</strong> 2:00 PM to 4:00 PM</span>
  </div>
</div>
      <div className="intro-note"><ShieldCheck size={18} /><span>All fields marked with <b>*</b> are required.</span></div>
      {/* <div className="info-visuals" aria-label="About GDG and the chapter">
        <img src={chapterInfo} alt="Who are we? The official Google Developer Group chapter at JSS Academy of Technical Education, Bengaluru." />
        <img src={gdgInfo} alt="What is GDG? Google Developer Groups are communities of developers, learners, and technology enthusiasts." />
      </div> */}
    </section>
    <section className="form-card" aria-labelledby="registration-title">
      <div className="form-card-head"><div><p className="kicker">Chapter 2.0</p><h2 id="registration-title">Register your interest</h2></div><span className="step-badge">01 / 01</span></div>
      <form onSubmit={submit} noValidate>
        <Field label="Full Name" required error={errors.name}><input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Your full name" autoComplete="name" /></Field>
        <Field label="Sr. No." required hint="Format: 24-0540" error={errors.sr_no}><input value={form.sr_no} onChange={(event) => update('sr_no', event.target.value)} placeholder="24-0540" autoComplete="off" /></Field>
        <Field label="USN (if you have one)" hint="Format: 1JS24IS160" error={errors.usn}><input value={form.usn} onChange={(event) => update('usn', event.target.value)} placeholder="1JS24IS160" autoComplete="off" /></Field>
        <fieldset className={errors.branch ? 'has-error' : ''}><legend>Branch <span className="required">*</span></legend><div className="radio-grid">{branches.map((branch) => <label className="radio-option" key={branch}><input type="radio" name="branch" value={branch} checked={form.branch === branch} onChange={(event) => update('branch', event.target.value)} /><span>{branch}</span></label>)}</div>{errors.branch && <p className="error-text" role="alert">{errors.branch}</p>}</fieldset>
        <Field label="Year" required error={errors.year}><div className="select-wrap"><select value={form.year} onChange={(event) => update('year', event.target.value)}><option value="">Select your year</option>{years.map((year) => <option key={year}>{year}</option>)}</select><ChevronDown size={17} /></div></Field>
        <Field label="Email ID" required hint="Personal or college email" error={errors.email}><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="you@example.com" autoComplete="email" /></Field>
        <input value={form.honeypot} onChange={(event) => update('honeypot', event.target.value)} tabIndex="-1" autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1 }} />
        {submitState === 'success' && <div className="submission-success" role="status"><strong>Registration saved</strong><span>{submitMessage}</span></div>}
        {submitState === 'error' && <div className="submission-error" role="alert"><strong>Unable to save registration</strong><span>{submitMessage}</span></div>}
        <button className="button submit-button" type="submit" disabled={submitState === 'loading' || submitState === 'success'}>{submitState === 'loading' ? 'Saving registration…' : submitState === 'success' ? 'Registration saved' : 'Submit registration'} <ArrowRight size={18} /></button>
        <p className="form-footnote"><span className="required">*</span> Required fields</p>
        <p className="recovery-link"><a href="/recover">Recover My Ticket</a></p>
      </form>
    </section>
  </div></main><Footer /></>
}

function RecoveryPage() {
  const navigate = useNavigate()
  const [srNo, setSrNo] = useState('')
  const [state, setState] = useState('idle')
  const [message, setMessage] = useState('')
  const [ticket, setTicket] = useState(null)

  const recover = async (event) => {
    event.preventDefault()
    setState('loading')
    setMessage('')
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/ticket-recovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sr_no: srNo }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'That Sr. No. did not match an existing registration.')
      setTicket(payload.ticket)
      setState('success')
    } catch (error) {
      setMessage(error.message)
      setState('error')
    }
  }

  if (state === 'success' && ticket) {
    return <TicketConfirmation ticket={ticket} qrDataUrl={ticket.qr_data_url} onDownloadPng={() => downloadTicketPng(ticket, ticket.qr_data_url)} onDownloadPdf={() => downloadTicketPdf(ticket, ticket.qr_data_url)} />
  }

  return <main className="preview-page"><div className="container recovery-wrap">
    <QrCode size={38} />
    <p className="kicker">Recover My Ticket</p>
    <h1>Find your ticket.</h1>
    <p>Enter the Sr. No. used during registration to find your existing ticket.</p>
    <form onSubmit={recover} className="recovery-form">
      <label htmlFor="recovery-sr-no">Sr. No.</label>
      <input id="recovery-sr-no" inputMode="numeric" pattern="[0-9]{2}-[0-9]{4}" maxLength="7" value={srNo} onChange={(event) => setSrNo(event.target.value)} placeholder="24-0540" autoComplete="off" required />
      <button className="button" type="submit" disabled={state === 'loading'}>{state === 'loading' ? 'Looking up ticket…' : 'Recover My Ticket'}</button>
    </form>
    {message && <p className="error-text" role="alert">{message}</p>}
    <button className="button button-secondary" type="button" onClick={() => navigate('/')}>Back to registration</button>
  </div></main>
}

function AdminScanner({ onToken, onClose }) {
  const videoRef = useRef(null)
  const scannerRef = useRef(null)
  const lastTokenRef = useRef('')
  const [state, setState] = useState('starting')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let mounted = true
    if (!videoRef.current) return undefined
    const scanner = new QrScanner(videoRef.current, (result) => {
      if (!mounted || result.data === lastTokenRef.current) return
      lastTokenRef.current = result.data
      void onToken(result.data)
    }, { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true })
    scannerRef.current = scanner
    scanner.start()
      .then(() => { if (mounted) setState('scanning') })
      .catch(() => {
        if (mounted) {
          setState('error')
          setMessage('Camera access is unavailable. Check permission and use HTTPS or localhost, then try manual lookup.')
        }
      })
    return () => {
      mounted = false
      scanner.stop()
      scanner.destroy()
      scannerRef.current = null
    }
  }, [])

  const stop = () => {
    scannerRef.current?.stop()
    setState('stopped')
  }

  return <div className="scanner-panel"><div className="scanner-header"><h2>Scan participant ticket</h2><button className="button button-secondary" type="button" onClick={onClose}>Close</button></div><video ref={videoRef} className="scanner-video" muted playsInline aria-label="QR scanner camera preview" />{state === 'starting' && <p role="status">Requesting camera permission…</p>}{state === 'scanning' && <p role="status">Point the rear camera at the participant QR code.</p>}{state === 'error' && <p className="error-text" role="alert">{message}</p>}{state === 'stopped' && <p>Scanner stopped.</p>}<button className="button button-secondary" type="button" onClick={stop} disabled={state !== 'scanning'}>Stop camera</button></div>
}

function AdminDashboard({ session }) {
  const [dashboard, setDashboard] = useState(null)
  const [attendees, setAttendees] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [checkedIn, setCheckedIn] = useState('')
  const [state, setState] = useState('loading')
  const [message, setMessage] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [lookup, setLookup] = useState(null)
  const [lookupState, setLookupState] = useState('idle')
  const [lookupType, setLookupType] = useState('fallback_id')
  const [lookupValue, setLookupValue] = useState('')
  const [lookupRequest, setLookupRequest] = useState(null)
  const [recoveredTicket, setRecoveredTicket] = useState(null)
  const pageSize = 25

  const getAdminAuthHeaders = async () => {
    const { data } = await supabaseAuth.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : null
  }

  const lookupAttendee = async (value, autoCheckIn = false) => {
    const headers = await getAdminAuthHeaders()
    if (!headers) {
      setMessage('Your admin session has expired. Please sign in again.')
      setLookupState('error')
      return
    }
    if (lookupState === 'loading') return
    setMessage('')
    setLookup(null)
    setLookupState('loading')
    const request = autoCheckIn ? { token: value } : { [lookupType]: value.trim() }
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/check-in/lookup`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'No matching attendee was found.')
      setLookup(payload)
      setLookupRequest(request)
      setLookupState('found')
      if (autoCheckIn) await confirmCheckIn(request)
    } catch (error) {
      setMessage(error.message || 'The attendee lookup could not be completed.')
      setLookupState('error')
    }
  }

  const confirmCheckIn = async (request = lookupRequest) => {
    if (!request) return
    const headers = await getAdminAuthHeaders()
    if (!headers) {
      setMessage('Your admin session has expired. Please sign in again.')
      setLookupState('error')
      return
    }
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/check-in`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(payload.message || 'Check-in failed.')
      setLookupState('error')
      return
    }
    setLookup(payload)
    setLookupState(payload.result)
    await load(page)
  }

  const recoverTicket = async () => {
    if (!lookupRequest || lookupRequest.token) return
    const headers = await getAdminAuthHeaders()
    if (!headers) {
      setMessage('Your admin session has expired. Please sign in again.')
      return
    }
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/ticket-recovery`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(lookupRequest),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(payload.message || 'The ticket could not be recovered.')
      return
    }
    setRecoveredTicket({ ...payload.ticket, qrDataUrl: payload.ticket.qr_data_url })
  }

  const load = async (nextPage = 1) => {
    const { data } = await supabaseAuth.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    setState('loading')
    const query = new URLSearchParams({ page: String(nextPage), page_size: String(pageSize) })
    if (search) query.set('search', search)
    if (checkedIn) query.set('checked_in', checkedIn)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [summaryResponse, listResponse] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/dashboard`, { headers }),
        fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/attendees?${query}`, { headers }),
      ])
      const summary = await summaryResponse.json().catch(() => ({}))
      const list = await listResponse.json().catch(() => ({}))
      if (!summaryResponse.ok || !listResponse.ok) throw new Error(summary.message || list.message || 'Dashboard data could not be loaded.')
      setDashboard(summary.dashboard)
      setAttendees(list.attendees || [])
      setTotal(list.total || 0)
      setPage(nextPage)
      setState('ready')
    } catch (error) {
      setMessage(error.message)
      setState('error')
    }

    const lookupAttendee = async (value, autoCheckIn = false) => {
      const { data } = await supabaseAuth.auth.getSession()
      const token = data.session?.access_token
      if (!token || lookupState === 'loading') return
      setLookupState('loading')
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/check-in/lookup`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(autoCheckIn ? { token: value } : { [lookupType]: value }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.message || 'No matching attendee was found.')
        setLookup(payload)
        setLookupRequest(autoCheckIn ? { token: value } : { [lookupType]: value })
        setLookupState('found')
        if (autoCheckIn) await confirmCheckIn({ token: value })
      } catch (error) {
        setLookup(null)
        setMessage(error.message)
        setLookupState('error')
      }
    }

    const confirmCheckIn = async (request = lookupRequest) => {
      if (!request) return
      const { data } = await supabaseAuth.auth.getSession()
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/check-in`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(payload.message || 'Check-in failed.')
        setLookupState('error')
        return
      }

      const recoverTicket = async () => {
        if (!lookupRequest || lookupRequest.token) return
        const { data } = await supabaseAuth.auth.getSession()
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/ticket-recovery`, {
          method: 'POST',
          headers: { Authorization: `****** || ''}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(lookupRequest),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          setMessage(payload.message || 'The ticket could not be recovered.')
          return
        }
        setRecoveredTicket({ ...payload.ticket, qrDataUrl: payload.ticket.qr_data_url })
      }
      setLookup(payload)
      setLookupState(payload.result)
      await load(page)
    }
  }

  useEffect(() => { void load() }, [])

  const download = async (format) => {
    const { data } = await supabaseAuth.auth.getSession()
    const query = new URLSearchParams()
    if (search) query.set('search', search)
    if (checkedIn) query.set('checked_in', checkedIn)
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/attendees.${format}?${query}`, {
      headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
    })
    if (!response.ok) {
      setMessage('The export could not be generated.')
      return
    }
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = `gdg-attendees.${format}`
    link.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return <div className="admin-dashboard"><div className="admin-heading"><div><p className="kicker">Authorized admin</p><h1>Attendee dashboard</h1><p>Signed in as {session.email}.</p></div></div>
    {state === 'loading' && <p role="status">Loading dashboard data…</p>}
    {state === 'error' && <p className="error-text" role="alert">{message}</p>}
    {state === 'ready' && dashboard && <><div className="stat-grid">{[['Registered', dashboard.total], ['Checked in', dashboard.checked_in], ['Remaining', dashboard.remaining], ['Attendance', `${dashboard.attendance_percentage}%`]].map(([label, value]) => <div className="stat-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="checkin-tools"><button className="button" type="button" onClick={() => { setScannerOpen(true); setLookupState('idle') }}>Open QR scanner</button><div className="manual-lookup"><select aria-label="Manual lookup type" value={lookupType} onChange={(event) => setLookupType(event.target.value)}><option value="fallback_id">Fallback ID</option><option value="ticket_reference">Ticket reference</option><option value="usn">USN</option></select><input aria-label="Manual lookup value" value={lookupValue} onChange={(event) => setLookupValue(event.target.value)} placeholder="Enter lookup value" /><button className="button button-secondary" type="button" onClick={() => void lookupAttendee(lookupValue)}>Look up</button></div></div>
      {scannerOpen && <AdminScanner onToken={(token) => lookupAttendee(token, true)} onClose={() => setScannerOpen(false)} />}
      {lookupState === 'loading' && <p role="status">Looking up attendee…</p>}
      {lookupState === 'error' && <p className="error-text" role="alert">{message || 'The attendee lookup could not be completed.'}</p>}
      {lookupState !== 'idle' && lookup && <div className="lookup-result"><p className="kicker">Attendee found</p><p><strong>{lookup.attendee.name}</strong> · {lookup.attendee.sr_no} · {lookup.attendee.branch} · {lookup.attendee.year}</p><p>Fallback ID: {lookup.attendee.fallback_id} · Status: {lookup.attendee.checked_in ? `Checked in at ${new Date(lookup.attendee.checked_in_at).toLocaleString()}` : 'Not checked in'}</p>{lookupState === 'found' && <><button className="button" type="button" onClick={() => void confirmCheckIn()}>Confirm check-in</button>{!lookupRequest?.token && <button className="button button-secondary" type="button" onClick={() => void recoverTicket()}>Recover ticket for participant</button>}</>}{lookupState === 'checked_in' && <p className="success-text" role="status">Check-in recorded successfully.</p>}{lookupState === 'already_checked_in' && <p role="status">This attendee was already checked in.</p>}</div>}
      {recoveredTicket && <div className="lookup-result"><p className="kicker">Recovered ticket</p><p>Ticket reference: <strong>{recoveredTicket.reference}</strong></p><img className="ticket-qr" src={recoveredTicket.qrDataUrl} alt={`QR ticket for ${recoveredTicket.reference}`} /><div className="ticket-actions"><button className="button" type="button" onClick={() => void downloadTicketPng(recoveredTicket, recoveredTicket.qrDataUrl)}>Download PNG</button><button className="button" type="button" onClick={() => void downloadTicketPdf(recoveredTicket, recoveredTicket.qrDataUrl)}>Download PDF</button></div></div>}
      <div className="admin-toolbar"><input aria-label="Search attendees" placeholder="Search name, ID, USN, or email" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load() }} /><select aria-label="Check-in filter" value={checkedIn} onChange={(event) => { setCheckedIn(event.target.value); setTimeout(() => void load(), 0) }}><option value="">All check-in statuses</option><option value="true">Checked in</option><option value="false">Not checked in</option></select><button className="button" type="button" onClick={() => void load()}>Search</button><button className="button button-secondary" type="button" onClick={() => void download('csv')}>CSV</button><button className="button button-secondary" type="button" onClick={() => void download('xlsx')}>XLSX</button></div>
      {attendees.length === 0 ? <p className="admin-empty">No attendees match the current filters.</p> : <div className="table-wrap"><table><thead><tr>{['Name', 'Sr. No.', 'USN', 'Branch', 'Year', 'Ticket', 'Fallback ID', 'Status'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{attendees.map((attendee) => <tr key={attendee.id}><td>{attendee.name}</td><td>{attendee.sr_no}</td><td>{attendee.usn || '—'}</td><td>{attendee.branch}</td><td>{attendee.year}</td><td>{attendee.ticket_reference}</td><td>{attendee.fallback_id}</td><td>{attendee.checked_in ? 'Checked in' : 'Not checked in'}</td></tr>)}</tbody></table></div>}
      <div className="pagination"><button className="button button-secondary" type="button" disabled={page <= 1} onClick={() => void load(page - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button className="button button-secondary" type="button" disabled={page >= totalPages} onClick={() => void load(page + 1)}>Next</button></div>
    </>}
  </div>
}

function Admin() {
  const [state, setState] = useState('loading')
  const [message, setMessage] = useState('')
  const [session, setSession] = useState(null)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const validateSession = async (accessToken) => {
    if (!accessToken) {
      setSession(null)
      setState('signed-out')
      return
    }
    const query = new URLSearchParams()
    if (email.trim()) query.set('email', email.trim())
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/session?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setSession(null)
      setState(response.status === 403 ? 'denied' : 'signed-out')
      setMessage(payload.message || 'Authentication is invalid or expired.')
      return
    }
    setSession(payload.user)
    setState('authorized')
  }

  useEffect(() => {
    if (!supabaseAuth) {
      setState('unconfigured')
      return undefined
    }
    let mounted = true
    supabaseAuth.auth.getSession()
      .then(({ data }) => {
        if (mounted) return validateSession(data.session?.access_token)
        return undefined
      })
      .catch(() => {
        if (mounted) {
          setState('signed-out')
          setMessage('Authentication could not be verified.')
        }
      })
    const { data: subscription } = supabaseAuth.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) void validateSession(nextSession?.access_token)
    })
    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const signIn = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setBusy(false)
      setMessage('The email or password is incorrect.')
      return
    }
    if (!data.session?.access_token) {
      setBusy(false)
      setMessage('Authentication could not be completed. Please try again.')
      return
    }
    await validateSession(data.session.access_token)
    setPassword('')
    setBusy(false)
  }

  const signOut = async () => {
    setBusy(true)
    await supabaseAuth?.auth.signOut()
    setSession(null)
    setState('signed-out')
    setBusy(false)
  }

  if (state === 'loading') return <main className="admin-page"><div className="container admin-shell"><p>Checking admin access…</p></div></main>
  if (state === 'unconfigured') return <main className="admin-page"><div className="container admin-shell"><p className="kicker">Admin access</p><h1>Admin sign-in is unavailable.</h1><p>Set the browser-safe <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> values, then restart the frontend. Never use the server secret key here.</p></div></main>
  if (state === 'denied') return <main className="admin-page"><div className="container admin-shell"><p className="kicker">Access denied</p><h1>This account is not authorized.</h1><p>{message || 'Only approved GDG team accounts may access the admin portal.'}</p><button className="button" type="button" onClick={signOut} disabled={busy}>Sign out</button></div></main>
  if (state !== 'authorized') return <main className="admin-page"><div className="container admin-shell"><p className="kicker">Internal route</p><h1>Admin sign-in</h1><p>Sign in with the Supabase account created for an approved administrator. The server verifies the session and allowlist before showing attendee data.</p><form onSubmit={signIn} className="recovery-form"><label htmlFor="admin-email">Email address</label><input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /><label htmlFor="admin-password">Password</label><input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />{message && <p className="error-text" role="alert">{message}</p>}<button className="button" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></div></main>
  return <main className="admin-page"><div className="container admin-shell"><AdminDashboard session={session} /><button className="button button-secondary" type="button" onClick={signOut} disabled={busy}>Sign out</button></div></main>
}

function SuccessPreview() {
  return <main className="preview-page"><div className="container preview-wrap"><QrCode size={38} /><p className="kicker">Future confirmation</p><h1>Registration confirmation will appear here.</h1><p>No confirmation or QR ticket is generated in this phase.</p></div></main>
}

function NotFound() {
  return <main className="preview-page"><div className="container preview-wrap"><p className="kicker">404</p><h1>Page not found.</h1><p>The page you requested does not exist.</p></div></main>
}

function App() {
  return <Routes><Route path="/" element={<RegistrationPage />} /><Route path="/recover" element={<RecoveryPage />} /><Route path={ADMIN_PATH} element={<Admin />} /><Route path="/success-preview" element={<SuccessPreview />} /><Route path={LEGACY_ADMIN_PATH} element={<NotFound />} /><Route path="*" element={<NotFound />} /></Routes>
}

export default App

//added
