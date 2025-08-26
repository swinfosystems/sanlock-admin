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

  const load = async () => {}
  useEffect(() => {
    if (!orgId) return
    let mounted = true
    const fetchDevices = async () => {
      setLoading(true)
      setError('')
      const { data, error } = await supabase
        .from('devices')
        .select('id, name, status, version, last_seen_at')
        .eq('org_id', orgId)
        .order('name', { ascending: true })
      if (!mounted) return
      if (error) setError(error.message)
      else setDevices(data || [])
      setLoading(false)
    }
    fetchDevices()
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

  if (loadingOrg) return <div>Loading org…</div>
  if (orgError) return <div style={{ color: 'crimson' }}>{orgError}</div>

  return (
    <div>
      <h3>Devices</h3>
      <form onSubmit={createDevice} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
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
                <li key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <strong>{d.name || '(unnamed)'}</strong>
                  <div style={{ fontSize: 12, color: '#555' }}>
                    Status: {d.status || 'unknown'} • Version: {d.version || '-'} • Last seen: {d.last_seen_at || '-'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
