import { useState, useCallback } from 'react'
import { noAuthFetch } from '../utils/api'
import type { PluginStatus } from '../types'

export function useStatus() {
    const [status, setStatus] = useState<PluginStatus | null>(null)

    const fetchStatus = useCallback(async () => {
        try {
            const data = await noAuthFetch<PluginStatus>('/status')
            if (data.code === 0 && data.data) {
                setStatus(data.data)
            }
        } catch (e) {
            console.error('Status fetch failed:', e)
        }
    }, [])

    return { status, fetchStatus }
}
