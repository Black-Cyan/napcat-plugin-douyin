import { useState, useEffect, useCallback } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { PluginConfig } from '../types'
import { IconTerminal } from '../components/icons'

export default function ConfigPage() {
    const [config, setConfig] = useState<PluginConfig | null>(null)
    const [saving, setSaving] = useState(false)
    const [clearing, setClearing] = useState(false)

    const fetchConfig = useCallback(async () => {
        try {
            const res = await noAuthFetch<PluginConfig>('/config')
            if (res.code === 0 && res.data) setConfig(res.data)
        } catch { showToast('获取配置失败', 'error') }
    }, [])

    useEffect(() => { fetchConfig() }, [fetchConfig])

    const saveConfig = useCallback(async (update: Partial<PluginConfig>) => {
        if (!config) return
        setSaving(true)
        try {
            const newConfig = { ...config, ...update }
            await noAuthFetch('/config', {
                method: 'POST',
                body: JSON.stringify(newConfig),
            })
            setConfig(newConfig)
            showToast('配置已保存', 'success')
        } catch {
            showToast('保存失败', 'error')
        } finally {
            setSaving(false)
        }
    }, [config])

    const updateField = <K extends keyof PluginConfig>(key: K, value: PluginConfig[K]) => {
        if (!config) return
        const updated = { ...config, [key]: value }
        setConfig(updated)
        saveConfig({ [key]: value })
    }

    const clearCache = useCallback(async () => {
        setClearing(true)
        try {
            const res = await noAuthFetch('/cache/clear', { method: 'POST' })
            if (res.code === 0) {
                showToast('缓存已清除', 'success')
            } else {
                showToast(res.message || '清除失败', 'error')
            }
        } catch {
            showToast('清除失败', 'error')
        } finally {
            setClearing(false)
        }
    }, [])

    if (!config) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-gray-400 text-sm">加载配置中...</div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 stagger-children">
            {/* 基础配置 */}
            <div className="card p-5 hover-lift">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
                    <IconTerminal size={16} className="text-gray-400" />
                    基础配置
                </h3>
                <div className="space-y-5">
                    <ToggleRow
                        label="启用插件"
                        desc="全局开关，关闭后不响应任何处理"
                        checked={config.enabled}
                        onChange={(v) => updateField('enabled', v)}
                    />
                    <ToggleRow
                        label="调试模式"
                        desc="启用后输出详细日志到控制台"
                        checked={config.debug}
                        onChange={(v) => updateField('debug', v)}
                    />
                </div>
            </div>

            {/* 抖音解析 */}
            <div className="card p-5 hover-lift">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
                    <IconTerminal size={16} className="text-gray-400" />
                    抖音解析
                </h3>
                <div className="space-y-5">
                    <ToggleRow
                        label="自动解析抖音链接"
                        desc="检测群聊中的抖音分享链接并自动转发无水印视频"
                        checked={config.douyinAutoParse}
                        onChange={(v) => updateField('douyinAutoParse', v)}
                    />
                    <InputRow
                        label="转发显示昵称"
                        desc="合并转发卡片中展示的昵称"
                        value={config.douyinForwardNickname}
                        onChange={(v) => updateField('douyinForwardNickname', v || '抖音解析')}
                    />
                    <SelectRow
                        label="视频质量"
                        desc="普通=720p，高质量=1080p，体积更大"
                        value={config.douyinVideoQuality}
                        options={[
                            { label: '普通', value: 'standard' },
                            { label: '高质量', value: 'high' },
                        ]}
                        onChange={(v) => updateField('douyinVideoQuality', v)}
                    />
                    <SelectRow
                        label="视频发送方式"
                        desc="为解决合并转发视频资源过期，可选择直接逐条发送。图文资源仍会以合并转发形式发送"
                        value={config.douyinVideoSendMode}
                        options={[
                            { label: '合并转发', value: 'forward' },
                            { label: '直接发送', value: 'direct' },
                        ]}
                        onChange={(v) => updateField('douyinVideoSendMode', v)}
                    />
                    <InputRow
                        label="视频大小上限 (MB)"
                        desc="超过 100MB 将上传为群文件，超过配置但未满 100MB 的视频不会发送"
                        value={String(config.maxVideoSizeMb)}
                        type="number"
                        onChange={(v) => updateField('maxVideoSizeMb', Math.max(0, Number(v) || 0))}
                    />
                    <InputRow
                        label="去重时间 (秒)"
                        desc="同群同链接在该时间内不重复发送"
                        value={String(config.dedupSeconds)}
                        type="number"
                        onChange={(v) => updateField('dedupSeconds', Math.max(0, Number(v) || 0))}
                    />
                    <InputRow
                        label="资源缓存时间 (天)"
                        desc="过 0 点算一天，为 0 则不缓存"
                        value={String(config.cacheDays)}
                        type="number"
                        onChange={(v) => updateField('cacheDays', Math.max(0, Math.floor(Number(v) || 0)))}
                    />
                    <InputRow
                        label="每日清除缓存时间"
                        desc="24 小时制 HH:mm，定时清空资源缓存与字符串池"
                        value={config.cacheClearTime}
                        type="time"
                        onChange={(v) => updateField('cacheClearTime', v || '03:00')}
                    />
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">手动清除缓存</div>
                            <div className="text-xs text-gray-400 mt-0.5">立即清除缓存资源与字符串池</div>
                        </div>
                        <button
                            className="btn text-xs px-3 py-2 bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
                            onClick={clearCache}
                            disabled={clearing}
                        >
                            {clearing ? '清除中...' : '立即清除'}
                        </button>
                    </div>
                </div>
            </div>

            {saving && (
                <div className="saving-indicator fixed bottom-4 right-4 bg-primary text-white text-xs px-3 py-2 rounded-lg shadow-lg flex items-center gap-2">
                    <div className="loading-spinner !w-3 !h-3 !border-[1.5px]" />
                    保存中...
                </div>
            )}
        </div>
    )
}

/* ---- 子组件 ---- */

function ToggleRow({ label, desc, checked, onChange }: {
    label: string; desc: string; checked: boolean; onChange: (v: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
            </div>
            <label className="toggle">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
                <div className="slider" />
            </label>
        </div>
    )
}

function InputRow({ label, desc, value, type = 'text', onChange }: {
    label: string; desc: string; value: string; type?: string; onChange: (v: string) => void
}) {
    const [local, setLocal] = useState(value)
    useEffect(() => { setLocal(value) }, [value])

    const handleBlur = () => {
        if (local !== value) onChange(local)
    }

    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{label}</div>
            <div className="text-xs text-gray-400 mb-2">{desc}</div>
            <input
                className="input-field"
                type={type}
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
            />
        </div>
    )
}

function SelectRow({ label, desc, value, options, onChange }: {
    label: string
    desc: string
    value: string
    options: Array<{ label: string; value: string }>
    onChange: (v: any) => void
}) {
    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{label}</div>
            <div className="text-xs text-gray-400 mb-2">{desc}</div>
            <select
                className="input-field"
                value={value}
                onChange={(e) => onChange(e.target.value as 'standard' | 'high')}
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    )
}
