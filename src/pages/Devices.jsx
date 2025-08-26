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

  if (loadingOrg) return <div>Loading org…</div>
  if (orgError) return <div style={{ color: 'crimson' }}>{orgError}</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Devices</h3>
        <button onClick={fetchDevices} disabled={loading}>Refresh</button>
      </div>

      <form onSubmit={createDevice} style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <input
          placeholder="New device name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ padding: 8 }}
        />
        <button type="submit" disabled={creating || !newName.trim()}>Add</button>
      </form>

      {error && <div style={{ color: 'crimson', marginBottom: 8 }}>{error}</div>}
      {loading ? (
        <div>Loading devices…</div>
      ) : (
        <div>
          {devices.length === 0 ? (
            <div>No devices yet.</div>
          ) : (
            <ul>
              {devices.map((d) => (
                <DeviceRow key={d.id} d={d} orgId={orgId} onCopy={copy} onEnqueue={enqueueCommand} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function DeviceRow({ d, orgId, onCopy, onEnqueue }) {
  const [type, setType] = useState('message_show')
  const [params, setParams] = useState('{"text":"Hello"}')
  const [showHistory, setShowHistory] = useState(false)

  return (
    <li style={{ padding: '12px 0', borderBottom: '1px solid #eee' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong>{d.name || '(unnamed)'}</strong>
        <span style={{ fontSize: 12, color: '#666' }}>ID: {d.id}</span>
        <button onClick={() => onCopy(d.id)}>Copy ID</button>
        <button onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide' : 'Commands history'}</button>
      </div>
      <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
        Status: {d.status || 'unknown'} • Version: {d.version || '-'} • Last seen: {d.last_seen_at || '-'}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="message_show">message_show</option>
          <option value="lock_now">lock_now</option>
          <option value="reboot">reboot</option>
        </select>
        <input
          style={{ flex: 1, padding: 6 }}
          value={params}
          onChange={(e) => setParams(e.target.value)}
          placeholder='{"key":"value"}'
        />
        <button onClick={() => onEnqueue(d.id, type, params)}>Send</button>
      </div>

      {showHistory && (
        <div style={{ background: '#fafafa', padding: 8, marginTop: 8 }}>
          <DeviceCommands orgId={orgId} deviceId={d.id} />
        </div>
      )}
    </li>
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
    let timer
    const init = async () => {
      await fetchCmds()
      // simple polling every 5s while panel is open
      timer = setInterval(fetchCmds, 5000)
    }
    init()
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [orgId, deviceId])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong>Recent commands</strong>
        <button onClick={fetchCmds} disabled={loading}>Refresh</button>
      </div>
      {error && <div style={{ color: 'crimson', marginTop: 6 }}>{error}</div>}
      {loading ? (
        <div>Loading…</div>
      ) : cmds.length === 0 ? (
        <div>No commands yet.</div>
      ) : (
        <ul>
          {cmds.map((c) => (
            <li key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ minWidth: 120 }}><strong>{c.type}</strong></span>
                <span>Status: {c.status}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>{new Date(c.updated_at || c.created_at).toLocaleString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
