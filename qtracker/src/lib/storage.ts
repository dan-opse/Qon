import { Assignment, SyncState } from './types';

const STORAGE_KEY = 'qtracker_state';

const defaultState: SyncState = {
    lastSynced: null,
    feedUrl: '',
    assignments: [],
};

export function loadState(): SyncState {
    if (typeof window === 'undefined') return defaultState;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState;
        return JSON.parse(raw);
    } catch {
        return defaultState;
    }
}

export function saveState(state: SyncState): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function mergeAssignments(existing: Assignment[], incoming: Assignment[]): Assignment[] {
    // Deduplicate by id (UID from ICS)
    const map = new Map<string, Assignment>();
    for (const a of existing) map.set(a.id, a);
    for (const a of incoming) map.set(a.id, a); // incoming overwrites existing
    return Array.from(map.values());
}

export function clearState(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
}
