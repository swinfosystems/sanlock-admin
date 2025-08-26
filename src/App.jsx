import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'

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

  return (
    <div style={{ padding: 24 }}>
      <h2>Sanlock Admin</h2>
      <div style={{ marginBottom: 12 }}>Signed in as <strong>{email}</strong></div>
      <button onClick={signOut}>Sign out</button>

      <hr style={{ margin: '20px 0' }} />

      <p>Welcome. Next, we will add Devices and Alerts pages.</p>
    </div>
  )
}
