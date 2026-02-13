import { useSyncExternalStore } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
    id: number
    message: string
    type: ToastType
    hiding?: boolean
}

let toasts: Toast[] = []
let toastId = 0
const listeners = new Set<() => void>()

function emitChange() {
    listeners.forEach(fn => fn())
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

function getSnapshot() {
    return toasts
}

export function addToast(message: string, type: ToastType = 'info') {
    const id = ++toastId
    toasts = [...toasts, { id, message, type }]
    emitChange()
    setTimeout(() => {
        toasts = toasts.map(t => t.id === id ? { ...t, hiding: true } : t)
        emitChange()
        setTimeout(() => {
            toasts = toasts.filter(t => t.id !== id)
            emitChange()
        }, 350)
    }, 3000)
}

export function useToasts() {
    return useSyncExternalStore(subscribe, getSnapshot)
}

export const showToast = (message: string, type: ToastType = 'info') => addToast(message, type)
