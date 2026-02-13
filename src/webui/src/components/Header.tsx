import type { PageId } from '../App'
import type { PluginStatus } from '../types'
import { IconSave } from './icons'

interface HeaderProps {
    title: string
    description: string
    isScrolled: boolean
    status: PluginStatus | null
    currentPage: PageId
}

export default function Header({ title, description, isScrolled, status, currentPage }: HeaderProps) {
    const isEnabled = status?.config?.enabled ?? false

    return (
        <header
            className={`
                sticky top-0 z-20 flex justify-between items-center px-4 py-4 md:px-8 md:py-5
                bg-[#f8f9fa] dark:bg-[#18191C]
                transition-[border-color,box-shadow,backdrop-filter] duration-300 ease-out
                ${isScrolled
                    ? 'border-b border-gray-200 dark:border-gray-800 shadow-sm backdrop-blur-sm bg-[#f8f9fa]/90 dark:bg-[#18191C]/90'
                    : 'border-b border-transparent'
                }
            `}
        >
            <div className="animate-fade-in-down">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
                <p className="text-gray-400 text-xs mt-0.5">{description}</p>
            </div>

            {currentPage === 'config' ? (
                <div className="header-badge flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#1e1e20] rounded-lg border border-gray-200 dark:border-gray-800">
                    <IconSave size={13} className="text-emerald-500" />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">自动保存</span>
                </div>
            ) : (
                <div className="header-badge flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#1e1e20] rounded-lg border border-gray-200 dark:border-gray-800">
                    <div className={`status-dot ${status ? (isEnabled ? 'online' : 'offline') : ''}`} />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        {status ? (isEnabled ? '运行中' : '已停用') : '连接中...'}
                    </span>
                </div>
            )}
        </header>
    )
}
