import { useState, useEffect, useCallback } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { GroupInfo } from '../types'
import { IconSearch, IconCheck, IconX, IconRefresh } from '../components/icons'

export default function GroupsPage() {
    const [groups, setGroups] = useState<GroupInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [selectAll, setSelectAll] = useState(false)
    const [selected, setSelected] = useState<Set<number>>(new Set())

    const fetchGroups = useCallback(async () => {
        setLoading(true)
        try {
            const res = await noAuthFetch<GroupInfo[]>('/groups')
            if (res.code === 0 && res.data) {
                setGroups(res.data)
            }
        } catch {
            showToast('获取群列表失败', 'error')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchGroups() }, [fetchGroups])

    const toggleGroup = async (groupId: number, enabled: boolean) => {
        try {
            await noAuthFetch(`/groups/${groupId}/config`, {
                method: 'POST',
                body: JSON.stringify({ enabled }),
            })
            setGroups(prev => prev.map(g =>
                g.group_id === groupId ? { ...g, enabled } : g
            ))
            showToast(`群 ${groupId} 已${enabled ? '启用' : '禁用'}`, 'success')
        } catch {
            showToast('操作失败', 'error')
        }
    }

    const bulkToggle = async (enabled: boolean) => {
        if (selected.size === 0) {
            showToast('请先选择群', 'warning')
            return
        }
        try {
            await noAuthFetch('/groups/bulk-config', {
                method: 'POST',
                body: JSON.stringify({ enabled, groupIds: Array.from(selected) }),
            })
            setGroups(prev => prev.map(g =>
                selected.has(g.group_id) ? { ...g, enabled } : g
            ))
            showToast(`已批量${enabled ? '启用' : '禁用'} ${selected.size} 个群`, 'success')
            setSelected(new Set())
            setSelectAll(false)
        } catch {
            showToast('批量操作失败', 'error')
        }
    }

    const toggleSelect = (groupId: number) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(groupId)) next.delete(groupId)
            else next.add(groupId)
            return next
        })
    }

    const toggleSelectAll = () => {
        if (selectAll) {
            setSelected(new Set())
        } else {
            setSelected(new Set(filtered.map(g => g.group_id)))
        }
        setSelectAll(!selectAll)
    }

    const filtered = groups.filter(g => {
        if (!search) return true
        const q = search.toLowerCase()
        return g.group_name?.toLowerCase().includes(q) || String(g.group_id).includes(q)
    })

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-gray-400 text-sm">加载群列表中...</div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* 工具栏 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 animate-fade-in-down">
                <div className="relative flex-1 w-full sm:max-w-xs">
                    <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        className="input-field pl-9"
                        placeholder="搜索群名称或群号..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button className="btn btn-ghost text-xs" onClick={fetchGroups}>
                        <IconRefresh size={13} />
                        刷新
                    </button>
                    {selected.size > 0 && (
                        <>
                            <button className="btn btn-primary text-xs animate-scale-in" onClick={() => bulkToggle(true)}>
                                <IconCheck size={13} />
                                批量启用 ({selected.size})
                            </button>
                            <button className="btn btn-danger text-xs animate-scale-in" onClick={() => bulkToggle(false)}>
                                <IconX size={13} />
                                批量禁用 ({selected.size})
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* 统计 */}
            <p className="text-xs text-gray-400">
                共 {groups.length} 个群，{groups.filter(g => g.enabled).length} 个已启用
                {search && `，搜索到 ${filtered.length} 个`}
            </p>

            {/* 群列表 */}
            <div className="card overflow-hidden animate-fade-in-up">
                <table className="w-full text-sm stagger-rows">
                    <thead>
                        <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02]">
                            <th className="py-2.5 px-4 font-medium w-10">
                                <input
                                    type="checkbox"
                                    checked={selectAll}
                                    onChange={toggleSelectAll}
                                    className="rounded border-gray-300 dark:border-gray-600"
                                />
                            </th>
                            <th className="py-2.5 px-4 font-medium">群名称</th>
                            <th className="py-2.5 px-4 font-medium">群号</th>
                            <th className="py-2.5 px-4 font-medium">成员</th>
                            <th className="py-2.5 px-4 font-medium text-right">状态</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                        {filtered.map((group) => (
                            <tr key={group.group_id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="py-2.5 px-4">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(group.group_id)}
                                        onChange={() => toggleSelect(group.group_id)}
                                        className="rounded border-gray-300 dark:border-gray-600"
                                    />
                                </td>
                                <td className="py-2.5 px-4">
                                    <span className="text-gray-800 dark:text-gray-200 font-medium">
                                        {group.group_name || '未知群'}
                                    </span>
                                </td>
                                <td className="py-2.5 px-4 font-mono text-xs text-gray-500">{group.group_id}</td>
                                <td className="py-2.5 px-4 text-xs text-gray-500">
                                    {group.member_count}/{group.max_member_count}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                    <label className="toggle">
                                        <input
                                            type="checkbox"
                                            checked={group.enabled}
                                            onChange={() => toggleGroup(group.group_id, !group.enabled)}
                                        />
                                        <div className="slider" />
                                    </label>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filtered.length === 0 && (
                    <div className="py-12 text-center empty-state">
                        <p className="text-gray-400 text-sm">{search ? '没有匹配的群' : '暂无群数据'}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
