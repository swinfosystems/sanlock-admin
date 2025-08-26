import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrgId } from '../lib/useOrg'
import { timeAgo } from '../lib/time'

export default function Dashboard() {
  const { orgId, loading: loadingOrg, error: orgError } = useOrgId()
  const [counts, setCounts] = useState({ devices: 0, alerts24h: 0, pendingCmds: 0 })
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    try {
      const since = new Date(Date.now() - 24*60*60*1000).toISOString()

      const [{ count: devCount, error: devErr }, { count: alertCount, error: alertErr }, { count: cmdCount, error: cmdErr }] = await Promise.all([
        supabase.from('devices').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
        supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('org_id', orgId).gte('created_at', since),
        supabase.from('commands').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'queued'),
      ])
      if (devErr) throw devErr
      if (alertErr) throw alertErr
      if (cmdErr) throw cmdErr

      const { data: recentAlerts, error: raErr } = await supabase
        .from('alerts')
        .select('id, device_id, type, meta_json, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(5)
      if (raErr) throw raErr

      setCounts({ devices: devCount || 0, alerts24h: alertCount || 0, pendingCmds: cmdCount || 0 })
      setAlerts(recentAlerts || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (orgId) refresh() }, [orgId])

  if (loadingOrg) return <div>Loading org…</div>
  if (orgError) return <div style={{ color: 'crimson' }}>{orgError}</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Dashboard</h3>
        <button onClick={refresh} disabled={loading}>Refresh</button>
      </div>
      {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <Stat label="Devices" value={counts.devices} />
        <Stat label="Alerts (24h)" value={counts.alerts24h} />
        <Stat label="Queued commands" value={counts.pendingCmds} />
      </div>

      <div style={{ marginTop: 20 }}>
        <strong>Recent alerts</strong>
        {loading ? (
          <div>Loading…</div>
        ) : alerts.length === 0 ? (
          <div style={{ marginTop: 8 }}>No alerts yet.</div>
        ) : (
          <ul style={{ marginTop: 8 }}>
            {alerts.map((a) => (
              <li key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
                <div>
                  <strong>{a.type}</strong>
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>{timeAgo(a.created_at)}</span>
                </div>
                <div style={{ fontSize: 12, color: '#555' }}>Device: {a.device_id}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: '12px 16px', minWidth: 160 }}>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
    </div>
  )
}
