import { useToasts, type Toast, type ToastType } from '../hooks/useToast'
import { IconCheck, IconX, IconInfo, IconAlert } from './icons'

const typeStyles: Record<ToastType, { bg: string; icon: React.ReactNode }> = {
    success: { bg: 'bg-emerald-600 text-white', icon: <IconCheck size={15} /> },
    error: { bg: 'bg-red-600 text-white', icon: <IconX size={15} /> },
    info: { bg: 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900', icon: <IconInfo size={15} /> },
    warning: { bg: 'bg-amber-500 text-white', icon: <IconAlert size={15} /> },
}

export default function ToastContainer() {
    const toasts = useToasts()

    return (
        <div className="fixed top-4 right-4 z-[100] pointer-events-none flex flex-col items-end gap-2">
            {toasts.map((toast: Toast) => {
                const style = typeStyles[toast.type]
                return (
                    <div
                        key={toast.id}
                        className={`
                            px-4 py-2.5 rounded-lg pointer-events-auto relative overflow-hidden
                            flex items-center gap-2 min-w-[180px] max-w-[360px]
                            text-sm font-medium shadow-lg
                            ${style.bg}
                            ${toast.hiding ? 'toast-exit' : 'toast-enter'}
                        `}
                    >
                        <span className="flex items-center gap-2 relative z-10">
                            {style.icon}
                            {toast.message}
                        </span>
                        {!toast.hiding && <div className="toast-progress" />}
                    </div>
                )
            })}
        </div>
    )
}
