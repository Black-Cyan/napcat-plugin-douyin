import type { PageId } from '../App'
import { IconDashboard, IconSettings, IconGroup, IconGithub, IconPlugin, IconSun, IconDownload } from './icons'

interface SidebarProps {
    currentPage: PageId
    onPageChange: (page: PageId) => void
}

const menuItems: { id: PageId; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: '仪表盘', icon: <IconDashboard size={18} /> },
    { id: 'config', label: '插件配置', icon: <IconSettings size={18} /> },
    { id: 'groups', label: '群管理', icon: <IconGroup size={18} /> },
    { id: 'cache', label: '缓存预览', icon: <IconDownload size={18} /> },
]

export default function Sidebar({ currentPage, onPageChange }: SidebarProps) {
    return (
        <aside className="w-60 flex-shrink-0 bg-white dark:bg-[#1a1b1d] border-r border-gray-200 dark:border-gray-800 flex flex-col">
            {/* Logo */}
            <div className="px-5 py-6 flex items-center gap-3">
                <div className="sidebar-logo w-8 h-8 flex items-center justify-center bg-brand-500 rounded-lg text-white">
                    <IconPlugin size={18} />
                </div>
                <div>
                    <h1 className="font-bold text-sm leading-tight text-gray-900 dark:text-white">抖音视频解析</h1>
                    <p className="text-[10px] text-gray-400 font-medium tracking-wider">NAPCAT PLUGIN</p>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto nav-stagger">
                {menuItems.map((item) => (
                    <div
                        key={item.id}
                        className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
                        onClick={() => onPageChange(item.id)}
                    >
                        <span className="sidebar-icon">{item.icon}</span>
                        <span>{item.label}</span>
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div className="px-3 pb-2">
                <a
                    href="https://github.com/Black-Cyan/napcat-plugin-douyin/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sidebar-item no-underline"
                >
                    <IconGithub size={18} />
                    <span>反馈问题</span>
                </a>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-center w-full py-2 rounded-lg text-gray-500 bg-gray-50 dark:bg-gray-800/50 cursor-default text-xs gap-2">
                    <IconSun size={14} className="opacity-60" />
                    <span>跟随系统主题</span>
                </div>
            </div>
        </aside>
    )
}
