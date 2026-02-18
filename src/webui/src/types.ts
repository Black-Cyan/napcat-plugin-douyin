/** WebUI 前端类型定义 */

export interface PluginStatus {
    pluginName: string
    uptime: number
    uptimeFormatted: string
    config: PluginConfig
    stats: {
        processed: number
        todayProcessed: number
        lastUpdateDay: string
    }
}

export interface PluginConfig {
    enabled: boolean
    debug: boolean
    douyinAutoParse: boolean
    douyinForwardNickname: string
    douyinVideoQuality: 'standard' | 'high'
    douyinVideoSendMode: 'forward' | 'direct'
    maxVideoSizeMb: number
    dedupSeconds: number
    cacheDays: number
    cacheClearTime: string
    groupConfigs?: Record<string, GroupConfig>
}

export interface GroupConfig {
    enabled?: boolean
}

export interface GroupInfo {
    group_id: number
    group_name: string
    member_count: number
    max_member_count: number
    enabled: boolean
}

export interface ApiResponse<T = unknown> {
    code: number
    data?: T
    message?: string
}

export interface CachePreviewEntry {
    url: string
    type: 'video' | 'image'
    author: string
    desc: string
    sizeMb: number | null
    cachedAt: number
    sourceUrl: string
}

export interface CachePreviewData {
    total: number
    stringPool: number
    entries: CachePreviewEntry[]
}
