import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrgId } from '../lib/useOrg'
import { timeAgo } from '../lib/time'

export default function Alerts() {
  const { orgId, loading: loadingOrg, error: orgError } = useOrgId()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // filters
  const [typeFilter, setTypeFilter] = useState('')
  const [deviceFilter, setDeviceFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [devices, setDevices] = useState([])

  const loadDevices = async () => {
    if (!orgId) return
    const { data, error } = await supabase
      .from('devices')
      .select('id, name')
      .eq('org_id', orgId)
      .order('name', { ascending: true })
    if (!error) setDevices(data || [])
  }

  const fetchAlerts = async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    let query = supabase
      .from('alerts')
      .select('id, device_id, type, meta_json, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (typeFilter) query = query.eq('type', typeFilter)
    if (deviceFilter) query = query.eq('device_id', deviceFilter)
    if (fromDate) query = query.gte('created_at', new Date(fromDate).toISOString())
    if (toDate) {
      const end = new Date(toDate)
      end.setHours(23, 59, 59, 999)
      query = query.lte('created_at', end.toISOString())
    }
    const { data, error } = await query
    if (error) setError(error.message)
    else setAlerts(data || [])
    setLoading(false)
  }

  // Build a memo of filter matches to check realtime inserts quickly
  const filterMatches = useMemo(() => {
    return (row) => {
      if (row.org_id !== orgId) return false
      if (typeFilter && row.type !== typeFilter) return false
      if (deviceFilter && row.device_id !== deviceFilter) return false
      if (fromDate && new Date(row.created_at) < new Date(fromDate)) return false
      if (toDate) {
        const end = new Date(toDate); end.setHours(23, 59, 59, 999)
        if (new Date(row.created_at) > end) return false
      }
      return true
    }
  }, [orgId, typeFilter, deviceFilter, fromDate, toDate])

  useEffect(() => {
    if (!orgId) return
    let mounted = true

    const run = async () => {
      await Promise.all([loadDevices(), fetchAlerts()])
    }
    run()

    // Realtime subscription for new alerts (respect filters in handler)
    const channel = supabase
      .channel(`alerts-insert-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts', filter: `org_id=eq.${orgId}` },
        (payload) => {
          if (!mounted) return
          const row = payload.new
          if (!filterMatches(row)) return
          setAlerts((prev) => [{
            id: row.id,
            device_id: row.device_id,
            type: row.type,
            meta_json: row.meta_json,
            created_at: row.created_at
          }, ...prev].slice(0, 200))
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [orgId, filterMatches])

  const createTestAlert = async () => {
    if (!orgId) return
    setBusy(true)
    setError('')
    try {
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
      await fetchAlerts()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const clearAlerts = async () => {
    if (!orgId) return
    const ok = confirm('Clear alerts with current filters? This cannot be undone.')
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      let del = supabase.from('alerts').delete().eq('org_id', orgId)
      if (typeFilter) del = del.eq('type', typeFilter)
      if (deviceFilter) del = del.eq('device_id', deviceFilter)
      if (fromDate) del = del.gte('created_at', new Date(fromDate).toISOString())
      if (toDate) {
        const end = new Date(toDate); end.setHours(23, 59, 59, 999)
        del = del.lte('created_at', end.toISOString())
      }
      const { error } = await del
      if (error) throw error
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
      <div className="toolbar">
        <h3>Alerts</h3>
        <button className="btn" onClick={fetchAlerts} disabled={loading}>Refresh</button>
        <button className="btn btn-primary" onClick={createTestAlert} disabled={busy}>Create test alert</button>
        <div className="right" />
        <button className="btn btn-danger" onClick={clearAlerts} disabled={busy}>Clear</button>
      </div>
      {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}

      <div className="card mt-12">
        <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
          <input placeholder="Type (e.g. test, offline)" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} />
          <select value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)}>
            <option value="">All devices</option>
            {devices.map(d => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
          </select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <button className="btn" onClick={fetchAlerts}>Apply</button>
        </div>
      </div>

      <div className="card mt-12">
        {loading ? (
          <div>Loading alerts…</div>
        ) : alerts.length === 0 ? (
          <div className="muted">No alerts found.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Device</th>
                <th>Type</th>
                <th>Meta</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <AlertRow key={a.id} a={a} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function AlertRow({ a }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr>
        <td style={{ fontSize: 12 }}>{timeAgo(a.created_at)}</td>
        <td className="code">{a.device_id}</td>
        <td><strong>{a.type}</strong></td>
        <td>
          {a.meta_json ? (
            <button className="btn btn-ghost" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'View'}</button>
          ) : (
            <span className="muted">-</span>
          )}
        </td>
      </tr>
      {open && a.meta_json && (
        <tr>
          <td colSpan={4}>
            <pre className="code" style={{ background: '#0c1427', padding: 8, overflowX: 'auto' }}>{JSON.stringify(a.meta_json, null, 2)}</pre>
          </td>
        </tr>
      )}
    </>
  )
}
