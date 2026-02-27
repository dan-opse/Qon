import { UrgencyLevel } from './types';

export function getUrgencyLevel(dueDate: string): UrgencyLevel {
    const now = new Date();
    const due = new Date(dueDate);
    const diffMs = due.getTime() - now.getTime();

    if (diffMs < 0) return 'overdue';
    if (diffMs < 24 * 60 * 60 * 1000) return 'critical';       // <24h
    if (diffMs < 3 * 24 * 60 * 60 * 1000) return 'warning';    // <3 days
    return 'normal';                                             // >3 days
}

export const urgencyConfig: Record<UrgencyLevel, { color: string; bg: string; label: string; border: string }> = {
    overdue: { color: '#FFFFFF', bg: '#B90E31', label: 'OVERDUE', border: '#B90E31' },
    critical: { color: '#FFFFFF', bg: '#B90E31', label: 'Due Soon', border: '#B90E31' },
    warning: { color: '#1a1a1a', bg: '#FEB70D', label: 'This Week', border: '#FEB70D' },
    normal: { color: '#FFFFFF', bg: '#002452', label: 'Upcoming', border: '#1e3a5f' },
};

export function formatCountdown(dueDate: string): string {
    const now = new Date();
    const due = new Date(dueDate);
    const diffMs = due.getTime() - now.getTime();

    if (diffMs < 0) {
        const absDiff = Math.abs(diffMs);
        const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        if (days > 0) return `${days}d ${hours}h ago`;
        return `${hours}h ago`;
    }

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}
