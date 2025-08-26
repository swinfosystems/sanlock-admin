import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrgId } from '../lib/useOrg'

export default function Devices({ isAdmin = true }) {
  const { orgId, loading: loadingOrg, error: orgError } = useOrgId()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  // UX state
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('name') // name|status|last_seen
  const [sortDir, setSortDir] = useState('asc') // asc|desc
  const [page, setPage] = useState(1)
  const pageSize = 10

  // command presets (fallback defaults)
  const defaultPresets = { message_show: { text: 'Hello' }, lock_now: {}, reboot: {} }
  const [presets, setPresets] = useState(defaultPresets)
  useEffect(() => {
    if (!orgId) return
    try {
      const raw = localStorage.getItem(`commandPresets:${orgId}`)
      if (raw) {
        const obj = JSON.parse(raw)
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) setPresets(obj)
        else setPresets(defaultPresets)
      } else {
        setPresets(defaultPresets)
      }
    } catch {
      setPresets(defaultPresets)
    }
  }, [orgId])

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
      // Realtime presence/updates (INSERT/UPDATE/DELETE on devices)
      const channel = supabase
        .channel(`devices-${orgId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'devices', filter: `org_id=eq.${orgId}` }, (p) => {
          if (!mounted) return
          const d = p.new
          setDevices((prev) => [d, ...prev.filter(x => x.id !== d.id)])
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'devices', filter: `org_id=eq.${orgId}` }, (p) => {
          if (!mounted) return
          const d = p.new
          setDevices((prev) => prev.map(x => x.id === d.id ? { ...x, ...d } : x))
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'devices', filter: `org_id=eq.${orgId}` }, (p) => {
          if (!mounted) return
          const d = p.old
          setDevices((prev) => prev.filter(x => x.id !== d.id))
        })
        .subscribe()
      return () => supabase.removeChannel(channel)
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

  const enqueueCommand = async (deviceId, type, paramsText, setJsonError) => {
    if (!orgId) return
    setBusy(true)
    setError('')
    try {
      let params
      try {
        params = paramsText ? JSON.parse(paramsText) : {}
        if (typeof params !== 'object' || Array.isArray(params)) throw new Error('Params must be a JSON object')
        setJsonError('')
      } catch (e) {
        setJsonError(e.message)
        throw new Error('Params must be valid JSON')
      }
      const { error } = await supabase
        .from('commands')
        .insert([{ org_id: orgId, device_id: deviceId, type, params_json: params }])
      if (error) throw error
      alert('Command enqueued')
    } catch (e) {
      if (!String(e.message || '').includes('JSON')) setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const renameDevice = async (id, name) => {
    try {
      const { error } = await supabase.from('devices').update({ name }).eq('org_id', orgId).eq('id', id)
      if (error) throw error
    } catch (e) {
      alert('Rename failed: ' + e.message)
    }
  }

  const deleteDevice = async (id) => {
    if (!isAdmin) return
    const ok = confirm('Delete this device? This cannot be undone.')
    if (!ok) return
    try {
      const { error } = await supabase.from('devices').delete().eq('org_id', orgId).eq('id', id)
      if (error) throw error
    } catch (e) {
      alert('Delete failed: ' + e.message)
    }
  }

  const statusBadge = (s) => {
    const cls = s === 'online' ? 'badge badge-success' : s === 'warning' ? 'badge badge-warning' : s === 'offline' ? 'badge badge-danger' : 'badge badge-neutral'
    return <span className={cls}>{s || 'unknown'}</span>
  }

  // derived list with search and sort
  const filteredSorted = useMemo(() => {
    const term = q.trim().toLowerCase()
    let list = devices.filter(d => !term || (d.name || '').toLowerCase().includes(term) || (d.id || '').toLowerCase().includes(term))
    list.sort((a,b) => {
      let av, bv
      if (sortKey === 'name') { av = a.name || ''; bv = b.name || '' }
      else if (sortKey === 'status') { av = a.status || ''; bv = b.status || '' }
      else { av = a.last_seen_at || ''; bv = b.last_seen_at || '' }
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [devices, q, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / pageSize))
  const pageItems = filteredSorted.slice((page-1)*pageSize, page*pageSize)

  useEffect(() => { setPage(1) }, [q, sortKey, sortDir])

  if (loadingOrg) return <div>Loading org…</div>
  if (orgError) return <div style={{ color: 'crimson' }}>{orgError}</div>

  return (
    <div>
      <div className="toolbar">
        <h3>Devices</h3>
        <button className="btn" onClick={fetchDevices} disabled={loading}>Refresh</button>
        <div className="right" />
        <input placeholder="Search name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          <option value="name">Name</option>
          <option value="status">Status</option>
          <option value="last_seen">Last seen</option>
        </select>
        <select value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
      </div>

      <form onSubmit={createDevice} className="row mt-12">
        <input
          placeholder="New device name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={creating || !newName.trim()}>Add</button>
      </form>

      {error && <div style={{ color: 'crimson', marginBottom: 8 }}>{error}</div>}
      {loading ? (
        <div>Loading devices…</div>
      ) : filteredSorted.length === 0 ? (
        <div className="mt-12 muted">No devices match.</div>
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
                <th style={{ width: 420 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((d) => (
                <DeviceRow key={d.id} d={d} orgId={orgId} onCopy={copy} onEnqueue={enqueueCommand} renderStatus={statusBadge} onRename={renameDevice} onDelete={deleteDevice} isAdmin={isAdmin} presets={presets} />
              ))}
            </tbody>
          </table>

          <div className="row mt-12">
            <span className="muted">Page {page} / {totalPages}</span>
            <div className="right" />
            <button className="btn" disabled={page<=1} onClick={() => setPage(1)}>First</button>
            <button className="btn" disabled={page<=1} onClick={() => setPage(p => Math.max(1, p-1))}>Prev</button>
            <button className="btn" disabled={page>=totalPages} onClick={() => setPage(p => Math.min(totalPages, p+1))}>Next</button>
            <button className="btn" disabled={page>=totalPages} onClick={() => setPage(totalPages)}>Last</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DeviceRow({ d, orgId, onCopy, onEnqueue, renderStatus, onRename, onDelete, isAdmin, presets }) {
  const [type, setType] = useState('message_show')
  const [params, setParams] = useState(JSON.stringify({ text: 'Hello' }))
  const [jsonError, setJsonError] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [showCam, setShowCam] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(d.name || '')

  useEffect(() => {
    // update params template when type changes, if user hasn't customized
    try {
      const parsed = JSON.parse(params || '{}')
      const isTemplate = JSON.stringify(parsed) === JSON.stringify({ text: 'Hello' }) || JSON.stringify(parsed) === JSON.stringify({})
      if (isTemplate) {
        const next = type === 'message_show' ? { text: 'Hello' } : {}
        setParams(JSON.stringify(next))
      }
    } catch { /* ignore */ }
  }, [type])

  const commitRename = async () => {
    setEditingName(false)
    if ((d.name || '') === nameDraft.trim()) return
    if (!nameDraft.trim()) { setNameDraft(d.name || ''); return }
    await onRename(d.id, nameDraft.trim())
  }

  const presetKeys = Object.keys(presets || {})

  return (
    <>
      <tr>
        <td>
          {editingName ? (
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key==='Enter') commitRename(); if (e.key==='Escape') { setEditingName(false); setNameDraft(d.name || '') } }} autoFocus />
          ) : (
            <>
              <strong>{d.name || '(unnamed)'}</strong>
              <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => setEditingName(true)}>Rename</button>
            </>
          )}
        </td>
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
          <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="message_show">message_show</option>
              <option value="lock_now">lock_now</option>
              <option value="reboot">reboot</option>
            </select>
            <select onChange={(e) => setParams(JSON.stringify((presets || {})[e.target.value] || {}))} defaultValue="">
              <option value="" disabled>Preset</option>
              {presetKeys.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <input
              style={{ flex: 1, minWidth: 160 }}
              value={params}
              onChange={(e) => setParams(e.target.value)}
              placeholder='{"key":"value"}'
            />
            <button className="btn btn-primary" disabled={!!jsonError} onClick={() => onEnqueue(d.id, type, params, setJsonError)}>Send</button>
            <button className="btn" onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide' : 'History'}</button>
            {isAdmin && (
              <button className="btn" onClick={() => setShowCam((v) => !v)}>{showCam ? 'Stop camera' : 'Request camera'}</button>
            )}
            {isAdmin && (<button className="btn btn-danger" onClick={() => onDelete(d.id)}>Delete</button>)}
          </div>
          {jsonError && <div style={{ color: 'crimson', fontSize: 12, marginTop: 4 }}>{jsonError}</div>}
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
      {showCam && (
        <tr>
          <td colSpan={6}>
            <div className="card">
              <CameraSession orgId={orgId} deviceId={d.id} onEnd={() => setShowCam(false)} />
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

function CameraSession({ orgId, deviceId, onEnd }) {
  const videoRef = useRef(null)
  const pcRef = useRef(null)
  const chanRef = useRef(null)
  const sessionIdRef = useRef(crypto.randomUUID())
  const [status, setStatus] = useState('init') // init|connecting|connected|ended|error
  const [err, setErr] = useState('')

  useEffect(() => {
    let mounted = true
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pcRef.current = pc

    pc.ontrack = (ev) => {
      if (!mounted) return
      const [stream] = ev.streams
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream
      }
    }

    pc.onicecandidate = async (ev) => {
      if (!ev.candidate) return
      try {
        await supabase.from('commands').insert([{ org_id: orgId, device_id: deviceId, type: 'webrtc_ice', params_json: { session_id: sessionIdRef.current, from: 'admin', candidate: ev.candidate } }])
      } catch (e) {
        console.error('insert ice failed', e)
      }
    }

    const start = async () => {
      setStatus('connecting')
      try {
        // We expect remote to send us media; we do not add local tracks.
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        await pc.setLocalDescription(offer)
        // send offer via commands
        const { error } = await supabase.from('commands').insert([{ org_id: orgId, device_id: deviceId, type: 'webrtc_offer', params_json: { session_id: sessionIdRef.current, sdp: offer.sdp } }])
        if (error) throw error
      } catch (e) {
        setErr(e.message)
        setStatus('error')
      }
    }

    start()

    // subscribe for answer/ice from device
    const channel = supabase
      .channel(`webrtc-${orgId}-${deviceId}-${sessionIdRef.current}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'commands', filter: `org_id=eq.${orgId} and device_id=eq.${deviceId}` }, async (p) => {
        const row = p.new
        const params = row.params_json || {}
        if (params.session_id !== sessionIdRef.current) return
        if (row.type === 'webrtc_answer') {
          try {
            await pc.setRemoteDescription({ type: 'answer', sdp: params.sdp })
            setStatus('connected')
          } catch (e) {
            console.error(e)
            setErr(e.message)
            setStatus('error')
          }
        } else if (row.type === 'webrtc_ice' && params.from === 'device' && params.candidate) {
          try {
            await pc.addIceCandidate(params.candidate)
          } catch (e) {
            console.error('addIceCandidate failed', e)
          }
        }
      })
      .subscribe()
    chanRef.current = channel

    return () => {
      mounted = false
      if (chanRef.current) supabase.removeChannel(chanRef.current)
      if (pcRef.current) {
        pcRef.current.getSenders().forEach(s => s.track && s.track.stop())
        pcRef.current.close()
      }
      setStatus('ended')
    }
  }, [orgId, deviceId])

  const stop = async () => {
    if (chanRef.current) supabase.removeChannel(chanRef.current)
    if (pcRef.current) {
      pcRef.current.getSenders().forEach(s => s.track && s.track.stop())
      pcRef.current.close()
    }
    try {
      await supabase.from('commands').insert([{ org_id: orgId, device_id: deviceId, type: 'webrtc_end', params_json: { session_id: sessionIdRef.current } }])
    } catch {}
    setStatus('ended')
    onEnd?.()
  }

  return (
    <div>
      <div className="row">
        <strong>Camera session</strong>
        <div className="right" />
        <span className="muted">{status}</span>
        <button className="btn" onClick={stop}>End</button>
      </div>
      {err && <div style={{ color: 'crimson', marginTop: 6 }}>{err}</div>}
      <div style={{ marginTop: 8 }}>
        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxHeight: 360, background: '#000' }} />
      </div>
      <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
        Requires the device agent to handle commands: webrtc_offer (create answer, send as webrtc_answer) and webrtc_ice bi-directional.
      </div>
    </div>
  )
}
