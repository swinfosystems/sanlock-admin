import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrgId } from '../lib/useOrg'

export default function Alerts() {
  const { orgId, loading: loadingOrg, error: orgError } = useOrgId()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orgId) return
    let mounted = true

    const fetchAlerts = async () => {
      setLoading(true)
      setError('')
      const { data, error } = await supabase
        .from('alerts')
        .select('id, device_id, type, meta_json, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (!mounted) return
      if (error) setError(error.message)
      else setAlerts(data || [])
      setLoading(false)
    }

    fetchAlerts()

    // Realtime subscription for new alerts
    const channel = supabase
      .channel(`alerts-insert-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new
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

  if (loadingOrg) return <div>Loading org…</div>
  if (orgError) return <div style={{ color: 'crimson' }}>{orgError}</div>

  return (
    <div>
      <h3>Alerts</h3>
      {error && <div style={{ color: 'crimson', marginBottom: 8 }}>{error}</div>}
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
                  {new Date(a.created_at).toLocaleString()}
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
  )
}
