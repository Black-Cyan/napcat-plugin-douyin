import { useCallback, useEffect, useMemo, useState } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { ParseRecord, ParseStatus, ParseErrorType } from '../types'
import { IconActivity, IconRefresh, IconAlert, IconTerminal, IconInfo, IconX } from '../components/icons'

const statusText: Record<ParseStatus, string> = {
    pending: '排队中',
    parsing: '解析中',
    success: '成功',
    failed: '失败',
}

const statusStyle: Record<ParseStatus, { bg: string; text: string }> = {
    pending: { bg: 'bg-gray-100 dark:bg-gray-800/60', text: 'text-gray-500 dark:text-gray-300' },
    parsing: { bg: 'bg-primary/10', text: 'text-primary' },
    success: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400' },
    failed: { bg: 'bg-red-500/10', text: 'text-red-500' },
}

const errorText: Record<ParseErrorType, string> = {
    api_request: '请求接口异常',
    api_response: '接口返回异常',
    download: '下载/发送异常',
}

function formatTime(ts: number): string {
    const d = new Date(ts)
    const pad = (v: number) => v.toString().padStart(2, '0')
    return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function ProgressBar({ value }: { value: number }) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)))
    return (
        <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800">
            <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${clamped}%` }}
            />
        </div>
    )
}

export default function ParseRecordsPage() {
    const [records, setRecords] = useState<ParseRecord[]>([])
    const [loading, setLoading] = useState(false)
    const [notePreview, setNotePreview] = useState<string | null>(null)

    const fetchRecords = useCallback(async () => {
        setLoading(true)
        try {
            const res = await noAuthFetch<ParseRecord[]>('/parse/records')
            if (res.code === 0 && res.data) {
                setRecords(res.data)
            }
        } catch {
            showToast('获取解析记录失败', 'error')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchRecords()
        const timer = setInterval(fetchRecords, 1000)
        return () => clearInterval(timer)
    }, [fetchRecords])

    const stats = useMemo(() => {
        const parsing = records.filter((r) => r.status === 'parsing').length
        const success = records.filter((r) => r.status === 'success').length
        const failed = records.filter((r) => r.status === 'failed').length
        return { parsing, success, failed }
    }, [records])

    return (
        <div className="space-y-6 stagger-children">
            <div className="card p-5 hover-lift flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <IconActivity size={18} />
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">解析记录</div>
                        <div className="text-xs text-gray-400">实时查看正在解析的视频进度与重试状态</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        className="btn-ghost btn text-xs px-3 py-2"
                        onClick={fetchRecords}
                        disabled={loading}
                    >
                        <IconRefresh size={14} />
                        刷新
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard icon={<IconTerminal size={15} />} label="进行中" value={stats.parsing} color="text-primary" bg="bg-primary/10" />
                <StatCard icon={<IconActivity size={15} />} label="成功" value={stats.success} color="text-emerald-500" bg="bg-emerald-500/10" />
                <StatCard icon={<IconAlert size={15} />} label="失败" value={stats.failed} color="text-red-500" bg="bg-red-500/10" />
            </div>

            <div className="card p-5 hover-lift">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
                            <IconActivity size={15} />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">实时解析列表</div>
                            <div className="text-xs text-gray-400">单次解析记录占一行，展示进度与错误类型</div>
                        </div>
                    </div>
                    <button className="btn-ghost btn text-xs px-3 py-2" onClick={fetchRecords} disabled={loading}>
                        <IconRefresh size={13} />
                        刷新
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm table-auto">
                        <thead className="text-xs text-gray-500 uppercase">
                            <tr className="border-b border-gray-100 dark:border-gray-800">
                                <th className="text-left py-2 pr-3">状态</th>
                                <th className="text-left py-2 pr-3">进度</th>
                                <th className="text-left py-2 pr-3">链接</th>
                                <th className="text-left py-2 pr-3">尝试</th>
                                <th className="text-left py-2 pr-3">阶段</th>
                                <th className="text-left py-2 pr-3">备注</th>
                                <th className="text-left py-2 pr-3">时间</th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center text-gray-400 py-6">暂无解析记录</td>
                                </tr>
                            )}
                            {records.map((rec) => {
                                const style = statusStyle[rec.status]
                                const lastLog = rec.logs[rec.logs.length - 1]?.message
                                return (
                                    <tr key={rec.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="py-2 pr-3">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>
                                                {statusText[rec.status]}
                                            </span>
                                            {rec.errorType && rec.status === 'failed' && (
                                                <span className="ml-2 text-xs text-red-500">{errorText[rec.errorType]}</span>
                                            )}
                                        </td>
                                        <td className="py-2 pr-3 w-48">
                                            <div className="flex items-center gap-2">
                                                <ProgressBar value={rec.progress} />
                                                <span className="text-xs text-gray-500 w-10 text-right">{Math.round(rec.progress)}%</span>
                                            </div>
                                        </td>
                                        <td className="py-2 pr-3 max-w-[260px] truncate text-gray-700 dark:text-gray-200" title={rec.url}>{rec.normalizedUrl}</td>
                                        <td className="py-2 pr-3 text-gray-700 dark:text-gray-200">{rec.attempts}/{rec.maxAttempts}</td>
                                        <td className="py-2 pr-3 text-gray-600 dark:text-gray-300 text-xs">{rec.stage}</td>
                                        <td className="py-2 pr-3 text-gray-600 dark:text-gray-300 text-xs">
                                            {rec.message || lastLog ? (
                                                <div className="flex items-center gap-2 max-w-[320px]">
                                                    <span className="truncate min-w-0" title={rec.message || lastLog}>
                                                        {rec.message || lastLog}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="p-1 rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-primary hover:border-primary/50 transition-colors"
                                                        title="查看完整备注"
                                                        onClick={() => setNotePreview(rec.message || lastLog || '')}
                                                    >
                                                        <IconInfo size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="py-2 pr-3 text-gray-500 text-xs">{formatTime(rec.updatedAt)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {notePreview && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
                    onClick={() => setNotePreview(null)}
                >
                    <div
                        className="w-full max-w-lg rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1e1e20] shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">完整备注</span>
                            <button
                                type="button"
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-primary"
                                onClick={() => setNotePreview(null)}
                                title="关闭"
                            >
                                <IconX size={16} />
                            </button>
                        </div>
                        <div className="p-4 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">
                            {notePreview}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function StatCard({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: number; color: string; bg: string }) {
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
