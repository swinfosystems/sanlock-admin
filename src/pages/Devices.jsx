import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrgId } from '../lib/useOrg'

export default function Devices() {
  const { orgId, loading: loadingOrg, error: orgError } = useOrgId()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  const fetchDevices = async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('devices')
      .select('id, name, status, version, last_seen_at')
      .eq('org_id', orgId)
      .order('name', { ascending: true })
    if (error) setError(error.message)
    else setDevices(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!orgId) return
    let mounted = true
    const init = async () => {
      await fetchDevices()
    }
    init()
    return () => { mounted = false }
  }, [orgId])

  const createDevice = async (e) => {
    e.preventDefault()
    if (!newName.trim() || !orgId) return
    setCreating(true)
    setError('')
    try {
      const { data, error } = await supabase
        .from('devices')
        .insert([{ org_id: orgId, name: newName.trim(), status: 'online' }])
        .select('id, name, status, version, last_seen_at')
        .single()
      if (error) throw error
      setDevices((prev) => [...prev, data].sort((a,b) => (a.name||'').localeCompare(b.name||'')))
      setNewName('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      alert('Copied!')
    } catch (e) {
      console.error(e)
    }
  }

  const enqueueCommand = async (deviceId, type, paramsText) => {
    if (!orgId) return
    setBusy(true)
    setError('')
    try {
      let params
      try {
        params = paramsText ? JSON.parse(paramsText) : {}
      } catch (e) {
        throw new Error('Params must be valid JSON')
      }
      const { error } = await supabase
        .from('commands')
        .insert([{ org_id: orgId, device_id: deviceId, type, params_json: params }])
      if (error) throw error
      alert('Command enqueued')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const statusBadge = (s) => {
    const cls = s === 'online' ? 'badge badge-success' : s === 'warning' ? 'badge badge-warning' : s === 'offline' ? 'badge badge-danger' : 'badge badge-neutral'
    return <span className={cls}>{s || 'unknown'}</span>
  }

  if (loadingOrg) return <div>Loading org…</div>
  if (orgError) return <div style={{ color: 'crimson' }}>{orgError}</div>

  return (
    <div>
      <div className="toolbar">
        <h3>Devices</h3>
        <button className="btn" onClick={fetchDevices} disabled={loading}>Refresh</button>
      </div>

      <form onSubmit={createDevice} className="row mt-12">
        <input
          placeholder="New device name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ padding: 8 }}
        />
        <button className="btn btn-primary" type="submit" disabled={creating || !newName.trim()}>Add</button>
      </form>

      {error && <div style={{ color: 'crimson', marginBottom: 8 }}>{error}</div>}
      {loading ? (
        <div>Loading devices…</div>
      ) : devices.length === 0 ? (
        <div className="mt-12 muted">No devices yet.</div>
      ) : (
        <div className="card mt-12">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>Status</th>
                <th>Version</th>
                <th>Last seen</th>
                <th style={{ width: 260 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <DeviceRow key={d.id} d={d} orgId={orgId} onCopy={copy} onEnqueue={enqueueCommand} renderStatus={statusBadge} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DeviceRow({ d, orgId, onCopy, onEnqueue, renderStatus }) {
  const [type, setType] = useState('message_show')
  const [params, setParams] = useState('{"text":"Hello"}')
  const [showHistory, setShowHistory] = useState(false)

  return (
    <>
      <tr>
        <td><strong>{d.name || '(unnamed)'}</strong></td>
        <td>
          <span className="code">{d.id}</span>
          <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => onCopy(d.id)}>Copy</button>
        </td>
        <td>{renderStatus(d.status)}</td>
        <td>{d.version || '-'}</td>
        <td style={{ fontSize: 12 }}>
          {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : '-'}
        </td>
        <td>
          <div className="row gap-8">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="message_show">message_show</option>
              <option value="lock_now">lock_now</option>
              <option value="reboot">reboot</option>
            </select>
            <input
              style={{ flex: 1, minWidth: 160 }}
              value={params}
              onChange={(e) => setParams(e.target.value)}
              placeholder='{"key":"value"}'
            />
            <button className="btn btn-primary" onClick={() => onEnqueue(d.id, type, params)}>Send</button>
            <button className="btn" onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide' : 'History'}</button>
          </div>
        </td>
      </tr>
      {showHistory && (
        <tr>
          <td colSpan={6}>
            <div className="card">
              <DeviceCommands orgId={orgId} deviceId={d.id} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function DeviceCommands({ orgId, deviceId }) {
  const [cmds, setCmds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchCmds = async () => {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('commands')
      .select('id, type, status, created_at, updated_at')
      .eq('org_id', orgId)
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) setError(error.message)
    else setCmds(data || [])
    setLoading(false)
  }

  useEffect(() => {
    let mounted = true
    const init = async () => {
      await fetchCmds()
      const channel = supabase
        .channel(`commands-${orgId}-${deviceId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'commands', filter: `org_id=eq.${orgId} and device_id=eq.${deviceId}` }, (payload) => {
          if (!mounted) return
          const row = payload.new
          setCmds((prev) => [{ id: row.id, type: row.type, status: row.status, created_at: row.created_at, updated_at: row.updated_at }, ...prev]
            .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 20))
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'commands', filter: `org_id=eq.${orgId} and device_id=eq.${deviceId}` }, (payload) => {
          if (!mounted) return
          const row = payload.new
          setCmds((prev) => prev.map((c) => c.id === row.id ? { ...c, status: row.status, updated_at: row.updated_at } : c))
        })
        .subscribe()
      return () => {
        supabase.removeChannel(channel)
      }
    }
    init()
    return () => {
      mounted = false
    }
  }, [orgId, deviceId])

  return (
    <div>
      <div className="toolbar">
        <strong>Recent commands</strong>
        <button className="btn" onClick={fetchCmds} disabled={loading}>Refresh</button>
      </div>
      {error && <div style={{ color: 'crimson', marginTop: 6 }}>{error}</div>}
      {loading ? (
        <div>Loading…</div>
      ) : cmds.length === 0 ? (
        <div className="muted">No commands yet.</div>
      ) : (
        <table className="table mt-8">
          <thead>
            <tr>
              <th>Type</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {cmds.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.type}</strong></td>
                <td>{c.status}</td>
                <td style={{ fontSize: 12 }}>{new Date(c.updated_at || c.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
