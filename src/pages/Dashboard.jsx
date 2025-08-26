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
      <div className="toolbar">
        <h3>Dashboard</h3>
        <button className="btn" onClick={refresh} disabled={loading}>Refresh</button>
      </div>
      {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}

      <div className="row gap-8 mt-12" style={{ flexWrap: 'wrap' }}>
        <StatCard label="Devices" value={counts.devices} />
        <StatCard label="Alerts (24h)" value={counts.alerts24h} />
        <StatCard label="Queued commands" value={counts.pendingCmds} />
      </div>

      <div className="card mt-16">
        <strong>Recent alerts</strong>
        {loading ? (
          <div className="mt-8">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="muted mt-8">No alerts yet.</div>
        ) : (
          <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none' }}>
            {alerts.map((a) => (
              <li key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <strong>{a.type}</strong>
                  <span style={{ marginLeft: 8, fontSize: 12 }} className="muted">{timeAgo(a.created_at)}</span>
                </div>
                <div className="code muted">Device: {a.device_id}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="card" style={{ minWidth: 220 }}>
      <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  )
}
