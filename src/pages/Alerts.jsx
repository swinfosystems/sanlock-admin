import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrgId } from '../lib/useOrg'
import { timeAgo } from '../lib/time'

export default function Alerts() {
  const { orgId, loading: loadingOrg, error: orgError } = useOrgId()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const fetchAlerts = async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('alerts')
      .select('id, device_id, type, meta_json, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) setError(error.message)
    else setAlerts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!orgId) return
    let mounted = true

    const run = async () => {
      await fetchAlerts()
    }
    run()

    // Realtime subscription for new alerts
    const channel = supabase
      .channel(`alerts-insert-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new
          if (!mounted) return
          setAlerts((prev) => [{
            id: row.id,
            device_id: row.device_id,
            type: row.type,
            meta_json: row.meta_json,
            created_at: row.created_at
          }, ...prev].slice(0, 50))
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [orgId])

  const createTestAlert = async () => {
    if (!orgId) return
    setBusy(true)
    setError('')
    try {
      // pick one device in this org
      const { data: dev, error: devErr } = await supabase
        .from('devices')
        .select('id')
        .eq('org_id', orgId)
        .limit(1)
        .maybeSingle()
      if (devErr) throw devErr
      if (!dev) throw new Error('Create a device first to attach the test alert.')

      const { error } = await supabase
        .from('alerts')
        .insert([{ org_id: orgId, device_id: dev.id, type: 'test', meta_json: { note: 'Hello from Admin UI' } }])
      if (error) throw error
      // rely on realtime to prepend, but also optimistic refresh
      await fetchAlerts()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loadingOrg) return <div>Loading org…</div>
  if (orgError) return <div style={{ color: 'crimson' }}>{orgError}</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Alerts</h3>
        <button onClick={fetchAlerts} disabled={loading}>Refresh</button>
        <button onClick={createTestAlert} disabled={busy}>Create test alert</button>
      </div>
      {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div>Loading alerts…</div>
        ) : alerts.length === 0 ? (
          <div>No alerts yet.</div>
        ) : (
          <ul>
            {alerts.map((a) => (
              <li key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
                <div>
                  <strong>{a.type}</strong>
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>
                    {timeAgo(a.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#555' }}>Device: {a.device_id}</div>
                {a.meta_json && (
                  <pre style={{ background: '#fafafa', padding: 8, fontSize: 12, overflowX: 'auto' }}>
                    {JSON.stringify(a.meta_json, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
