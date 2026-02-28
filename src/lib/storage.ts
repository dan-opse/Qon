import { Assignment, SyncState } from './types';

const STORAGE_KEY = 'qon_state';
const COMPLETED_KEY = 'qon_completed';

const defaultState: SyncState = {
    lastSynced: null,
    feedUrl: '',
    assignments: [],
    completedIds: [],
};

export function loadState(): SyncState {
    if (typeof window === 'undefined') return defaultState;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const state: SyncState = raw ? JSON.parse(raw) : { ...defaultState };
        // Ensure completedIds exists (for backwards compat with old storage)
        if (!state.completedIds) state.completedIds = [];
        return state;
    } catch {
        return { ...defaultState };
    }
}

export function saveState(state: SyncState): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadCompletedIds(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    try {
        const raw = localStorage.getItem(COMPLETED_KEY);
        if (!raw) return new Set();
        return new Set(JSON.parse(raw) as string[]);
    } catch {
        return new Set();
    }
}

export function saveCompletedIds(ids: Set<string>): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(Array.from(ids)));
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
