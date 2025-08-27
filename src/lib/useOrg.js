import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useOrgId() {
  const [orgId, setOrgId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No auth user')
        const { data, error } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('user_id', user.id)
          .maybeSingle()
        if (error) throw error
        if (!mounted) return
        setOrgId(data?.org_id ?? null)
      } catch (e) {
        if (!mounted) return
        setError(e.message)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  return { orgId, loading, error }
}
