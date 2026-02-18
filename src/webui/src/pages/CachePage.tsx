import { useEffect, useState, useCallback } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { CachePreviewData } from '../types'
import { IconRefresh, IconTerminal, IconActivity, IconDownload, IconAlert } from '../components/icons'

function formatSize(size: number | null): string {
    if (size === null) return '未知'
    if (size >= 1024) return `${(size / 1024).toFixed(1)} GB`
    return `${size.toFixed(1)} MB`
}

function formatTime(ts: number): string {
    const d = new Date(ts)
    const pad = (v: number) => v.toString().padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CachePage() {
    const [data, setData] = useState<CachePreviewData | null>(null)
    const [loading, setLoading] = useState(false)
    const [clearing, setClearing] = useState(false)

    const fetchPreview = useCallback(async () => {
        setLoading(true)
        try {
            const res = await noAuthFetch<CachePreviewData>('/cache/preview')
            if (res.code === 0 && res.data) {
                setData(res.data)
            }
        } catch {
            showToast('获取缓存信息失败', 'error')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchPreview() }, [fetchPreview])

    const handleClear = async () => {
        setClearing(true)
        try {
            const res = await noAuthFetch('/cache/clear', { method: 'POST' })
            if (res.code === 0) {
                showToast('缓存已清除', 'success')
                fetchPreview()
            } else {
                showToast(res.message || '清除失败', 'error')
            }
        } catch {
            showToast('清除失败', 'error')
        } finally {
            setClearing(false)
        }
    }

    const entries = data?.entries || []

    return (
        <div className="space-y-6 stagger-children">
            <div className="card p-5 hover-lift flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <IconTerminal size={18} />
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">缓存总览</div>
                        <div className="text-xs text-gray-400">查看已缓存的解析结果，仅展示信息，不包含资源</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        className="btn-ghost btn text-xs px-3 py-2"
                        onClick={fetchPreview}
                        disabled={loading}
                    >
                        <IconRefresh size={14} />
                        {loading ? '刷新中...' : '刷新'}
                    </button>
                    <button
                        className="btn text-xs px-3 py-2 bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
                        onClick={handleClear}
                        disabled={clearing}
                    >
                        <IconAlert size={14} />
                        {clearing ? '清除中...' : '立即清除缓存'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={<IconActivity size={16} />} label="缓存条目" value={data ? String(data.total) : '-'} color="text-primary" bg="bg-primary/10" />
                <StatCard icon={<IconDownload size={16} />} label="字符串池" value={data ? String(data.stringPool) : '-'} color="text-amber-500" bg="bg-amber-500/10" />
                <StatCard icon={<IconTerminal size={16} />} label="最新缓存时间" value={entries[0] ? formatTime(entries[0].cachedAt) : '-'} color="text-emerald-500" bg="bg-emerald-500/10" />
                <StatCard icon={<IconTerminal size={16} />} label="缓存状态" value={entries.length > 0 ? '可用' : '暂无缓存'} color="text-violet-500" bg="bg-violet-500/10" />
            </div>

            <div className="card p-5 hover-lift">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
                            <IconTerminal size={15} />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">缓存列表</div>
                            <div className="text-xs text-gray-400">仅展示元信息（作者、简介、类型、时间、大小）</div>
                        </div>
                    </div>
                    <button className="btn-ghost btn text-xs px-3 py-2" onClick={fetchPreview} disabled={loading}>
                        <IconRefresh size={13} />
                        {loading ? '刷新中...' : '刷新'}
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm table-auto">
                        <thead className="text-xs text-gray-500 uppercase">
                            <tr className="border-b border-gray-100 dark:border-gray-800">
                                <th className="text-left py-2 pr-3">类型</th>
                                <th className="text-left py-2 pr-3">作者</th>
                                <th className="text-left py-2 pr-3">简介</th>
                                <th className="text-left py-2 pr-3">大小</th>
                                <th className="text-left py-2 pr-3">缓存时间</th>
                                <th className="text-left py-2 pr-3">源链接</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center text-gray-400 py-6">暂无缓存</td>
                                </tr>
                            )}
                            {entries.map((item) => (
                                <tr key={item.url} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <td className="py-2 pr-3 text-gray-700 dark:text-gray-200">{item.type === 'video' ? '视频' : '图集'}</td>
                                    <td className="py-2 pr-3 text-gray-700 dark:text-gray-200">{item.author || '-'}</td>
                                    <td className="py-2 pr-3 text-gray-500 max-w-xs truncate" title={item.desc}>{item.desc || '-'}</td>
                                    <td className="py-2 pr-3 text-gray-700 dark:text-gray-200">{formatSize(item.sizeMb)}</td>
                                    <td className="py-2 pr-3 text-gray-500">{formatTime(item.cachedAt)}</td>
                                    <td className="py-2 pr-3 text-gray-500 max-w-xs truncate" title={item.sourceUrl}>{item.sourceUrl}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function StatCard({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: string; color: string; bg: string }) {
    return (
        <div className="card p-4 hover-lift">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400 font-medium">{label}</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg} ${color}`}>{icon}</div>
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">{value}</div>
        </div>
    )
}
