import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ArrowRight, ChevronDown, QrCode, ShieldCheck, Users } from 'lucide-react'
import gdgMark from './assets/image1.jpeg'
import chapterInfo from './assets/image2.jpeg'
import gdgInfo from './assets/image3.jpeg'
import chapterBrand from './assets/image4.jpeg'

const branches = ['CSE', 'ISE', 'CSE(AIML)', 'ECE', 'EIE', 'RA', 'MECH', 'CIV']
const years = ['1st Year', '2nd Year', '3rd Year', '4th Year']
const adminPath = import.meta.env.VITE_ADMIN_PATH || '/admin'

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

function RegistrationPage() {
  const [form, setForm] = useState({ name: '', id: '', branch: '', year: '', email: '' })
  const [errors, setErrors] = useState({})
  const [submitState, setSubmitState] = useState('idle')
  const [submitMessage, setSubmitMessage] = useState('')
  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: '' }))
    if (submitState !== 'idle') setSubmitState('idle')
    setSubmitMessage('')
  }
  const validate = () => {
    const next = {}
    if (!form.name.trim()) next.name = 'Please enter your full name.'
    if (!form.id.trim()) next.id = 'Please enter your USN or college serial number.'
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
        body: JSON.stringify({ name: form.name, usnOrSrno: form.id, email: form.email, branch: form.branch, year: form.year }),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.status === 201) {
        setSubmitState('success')
        setSubmitMessage('Your registration has been saved successfully.')
      } else if (response.status === 400) {
        setSubmitState('error')
        const serverErrors = payload.errors || {}
        setErrors((current) => ({ ...current, ...serverErrors, id: serverErrors.usnOrSrno || current.id }))
        setSubmitMessage(payload.message || 'Please correct the highlighted fields.')
      } else if (response.status === 409) {
        setSubmitState('error')
        setSubmitMessage(payload.message || 'This email or USN / SrNo is already registered.')
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
  return <><main className="registration-page" id="registration"><div className="container registration-layout">
    <section className="registration-intro">
      <img className="chapter-brand" src={chapterBrand} alt="Google Developer Group, JSS Academy of Technical Education, Bengaluru" />
      <p className="kicker">GDG Chapter 2.0</p>
      <h1>Bring your<br /><em>curiosity.</em></h1>
      <p className="intro-copy">Register your interest in joining the GDG Chapter 2.0 student community. Tell us a little about yourself to get started.</p>
      <div className="intro-note"><ShieldCheck size={18} /><span>All fields marked with <b>*</b> are required.</span></div>
      <div className="info-visuals" aria-label="About GDG and the chapter">
        <img src={chapterInfo} alt="Who are we? The official Google Developer Group chapter at JSS Academy of Technical Education, Bengaluru." />
        <img src={gdgInfo} alt="What is GDG? Google Developer Groups are communities of developers, learners, and technology enthusiasts." />
      </div>
    </section>
    <section className="form-card" aria-labelledby="registration-title">
      <div className="form-card-head"><div><p className="kicker">Chapter 2.0</p><h2 id="registration-title">Register your interest</h2></div><span className="step-badge">01 / 01</span></div>
      <form onSubmit={submit} noValidate>
        <Field label="Full Name" required error={errors.name}><input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Your full name" autoComplete="name" /></Field>
        <Field label="USN / SrNo" required hint="USN or college serial number" error={errors.id}><input value={form.id} onChange={(event) => update('id', event.target.value)} placeholder="e.g. 1XX22CS000" autoComplete="off" /></Field>
        <fieldset className={errors.branch ? 'has-error' : ''}><legend>Branch <span className="required">*</span></legend><div className="radio-grid">{branches.map((branch) => <label className="radio-option" key={branch}><input type="radio" name="branch" value={branch} checked={form.branch === branch} onChange={(event) => update('branch', event.target.value)} /><span>{branch}</span></label>)}</div>{errors.branch && <p className="error-text" role="alert">{errors.branch}</p>}</fieldset>
        <Field label="Year" required error={errors.year}><div className="select-wrap"><select value={form.year} onChange={(event) => update('year', event.target.value)}><option value="">Select your year</option>{years.map((year) => <option key={year}>{year}</option>)}</select><ChevronDown size={17} /></div></Field>
        <Field label="Email ID" required hint="Personal or college email" error={errors.email}><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="you@example.com" autoComplete="email" /></Field>
        {submitState === 'success' && <div className="submission-success" role="status"><strong>Registration saved</strong><span>{submitMessage}</span></div>}
        {submitState === 'error' && <div className="submission-error" role="alert"><strong>Unable to save registration</strong><span>{submitMessage}</span></div>}
        <button className="button submit-button" type="submit" disabled={submitState === 'loading' || submitState === 'success'}>{submitState === 'loading' ? 'Saving registration…' : submitState === 'success' ? 'Registration saved' : 'Submit registration'} <ArrowRight size={18} /></button>
        <p className="form-footnote"><span className="required">*</span> Required fields</p>
      </form>
    </section>
  </div></main><Footer /></>
}

function Admin() {
  return <main className="admin-page"><div className="container admin-shell"><p className="kicker">Internal route</p><h1>Admin dashboard</h1><p>This area is reserved for a future authenticated admin experience. No authentication or registration data is available.</p><div className="admin-placeholder"><Users size={24} /><span>Dashboard functionality will be added in a later phase.</span></div></div></main>
}

function SuccessPreview() {
  return <main className="preview-page"><div className="container preview-wrap"><QrCode size={38} /><p className="kicker">Future confirmation</p><h1>Registration confirmation will appear here.</h1><p>No confirmation or QR ticket is generated in this phase.</p></div></main>
}

function App() {
  return <Routes><Route path="/" element={<RegistrationPage />} /><Route path={adminPath} element={<Admin />} /><Route path="/success-preview" element={<SuccessPreview />} /><Route path="*" element={<RegistrationPage />} /></Routes>
}

export default App
