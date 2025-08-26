import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import Alerts from './pages/Alerts'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(session)
      setLoading(false)
    }
    init()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>

  if (!session) {
    return <Auth />
  }

  const email = session.user?.email

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const Nav = () => (
    <div className="topbar">
      <span className="brand">Sanlock Admin</span>
      <Link to="/">Dashboard</Link>
      <Link to="/devices">Devices</Link>
      <Link to="/alerts">Alerts</Link>
      <div className="spacer" />
      <span className="muted" style={{ marginRight: 12 }}>{email}</span>
      <button className="btn" onClick={signOut}>Sign out</button>
    </div>
  )

  return (
    <BrowserRouter>
      <Nav />
      <div className="page">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
