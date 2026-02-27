'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Assignment, TaskType } from '@/lib/types';
import { parseICS } from '@/lib/ics-parser';
import { loadState, saveState, mergeAssignments, clearState } from '@/lib/storage';
import { getUrgencyLevel, formatCountdown } from '@/lib/urgency';

// ─── Material Symbol helper ───
function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

// ─── Urgency config ───
const urgencyStyles = {
  overdue: {
    bar: 'bg-queens-red', dateBg: 'bg-queens-red/10', dateColor: 'text-queens-red',
    badge: 'bg-queens-red text-white', countdown: 'text-queens-red',
    countdownIcon: 'error', hoverBorder: 'hover:border-queens-red/50',
  },
  critical: {
    bar: 'bg-primary', dateBg: 'bg-primary/10', dateColor: 'text-primary',
    badge: 'bg-primary text-background-dark', countdown: 'text-primary',
    countdownIcon: 'timer', hoverBorder: 'hover:border-primary/50',
  },
  warning: {
    bar: 'bg-sky-400', dateBg: 'bg-sky-400/10', dateColor: 'text-sky-400',
    badge: 'bg-sky-500 text-white', countdown: 'text-sky-400',
    countdownIcon: 'schedule', hoverBorder: 'hover:border-sky-400/50',
  },
  normal: {
    bar: 'bg-slate-500', dateBg: 'bg-white/5', dateColor: 'text-slate-400',
    badge: 'bg-slate-600 text-white', countdown: 'text-slate-400',
    countdownIcon: 'event', hoverBorder: 'hover:border-slate-400/50',
  },
};

const typeLabels: Record<TaskType, string> = {
  assignment: 'Assignment', midterm: 'Midterm', exam: 'Exam',
  quiz: 'Quiz', lecture: 'Lecture', other: 'Event',
};

/** Course codes that are not real academic courses — hidden by default */
const NON_CLASS_CODES = new Set(['GENERAL', 'general', 'General']);

const DEFAULT_FEED_URL = 'https://onq.queensu.ca/d2l/le/calendar/feed/user/feed.ics?token=aav1w1mkvm0mpa7p4f4bb';

// ─── Context Menu ───
function ContextMenu({
  assignment,
  onHide,
  onComplete,
}: Readonly<{
  assignment: Assignment;
  onHide: (id: string) => void;
  onComplete: (id: string) => void;
}>) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const actions = [
    {
      icon: 'content_copy',
      label: 'Copy title',
      action: () => { navigator.clipboard.writeText(assignment.title); setOpen(false); },
    },
    {
      icon: 'open_in_new',
      label: 'Open in onQ',
      action: () => { window.open('https://onq.queensu.ca', '_blank'); setOpen(false); },
    },
    {
      icon: 'visibility_off',
      label: 'Hide',
      action: () => { onHide(assignment.id); setOpen(false); },
      danger: true,
    },
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center justify-center size-8 text-slate-400 hover:text-white transition-colors rounded"
        title="More options"
      >
        <Icon name="more_vert" className="text-xl" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-44 rounded-xl border border-white/10 bg-[#001228] shadow-2xl overflow-hidden animate-fade-in">
          {actions.map(({ icon, label, action, danger }) => (
            <button
              key={label}
              onClick={action}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-white/5 ${
                danger ? 'text-queens-red hover:bg-queens-red/10' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Icon name={icon} className="text-sm" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Complete Button ───
function CompleteButton({ id, onComplete }: Readonly<{ id: string; onComplete: (id: string) => void }>) {
  const [confirming, setConfirming] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirming) {
      onComplete(id);
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 2500);
    }
  };

  return (
    <button
      onClick={handleClick}
      title={confirming ? 'Click again to confirm' : 'Mark complete'}
      className={`flex items-center justify-center size-8 rounded transition-all ${
        confirming
          ? 'text-emerald-400 bg-emerald-500/20 hover:bg-emerald-500/30 scale-110'
          : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'
      }`}
    >
      <Icon name={confirming ? 'check_circle' : 'radio_button_unchecked'} className="text-xl" />
    </button>
  );
}

// ─── Assignment Card — list layout ───
function AssignmentCard({
  assignment, onHide, onComplete,
}: Readonly<{ assignment: Assignment; onHide: (id: string) => void; onComplete: (id: string) => void }>) {
  const [countdown, setCountdown] = useState(formatCountdown(assignment.dueDate));
  const urgency = getUrgencyLevel(assignment.dueDate);
  const style = urgencyStyles[urgency];

  useEffect(() => {
    const interval = setInterval(() => setCountdown(formatCountdown(assignment.dueDate)), 1000);
    return () => clearInterval(interval);
  }, [assignment.dueDate]);

  const due = new Date(assignment.dueDate);
  const month = due.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/Toronto' }).toUpperCase();
  const day = due.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/Toronto' });

  return (
    <div className={`group flex items-stretch bg-queens-blue rounded-xl border border-white/5 overflow-hidden transition-all ${style.hoverBorder} hover:bg-queens-blue/80`}>
      <div className={`w-1.5 ${style.bar}`} />
      <div className="flex-1 flex items-center justify-between p-4 gap-4">
        {/* Left: Complete + Date + Info */}
        <div className="flex items-center gap-4 min-w-0">
          <CompleteButton id={assignment.id} onComplete={onComplete} />
          {/* Date block */}
          <div className={`flex flex-col items-center justify-center ${style.dateBg} rounded-lg p-3 min-w-[64px] shrink-0`}>
            <span className={`${style.dateColor} text-xs font-bold`}>{month}</span>
            <span className="text-white text-xl font-black">{day}</span>
          </div>
          {/* Info */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {urgency === 'overdue' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-queens-red text-white uppercase tracking-tighter shrink-0">Overdue</span>
              )}
              {urgency === 'critical' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-background-dark uppercase tracking-tighter shrink-0">Urgent</span>
              )}
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${style.badge} uppercase tracking-tighter shrink-0`}>
                {typeLabels[assignment.type]}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-slate-300 shrink-0">
                {assignment.courseCode}
              </span>
            </div>
            <h3 className="text-white text-base font-bold group-hover:text-primary transition-colors truncate">
              {assignment.title}
            </h3>
            <p className="text-slate-400 text-sm truncate">{assignment.courseName}</p>
          </div>
        </div>
        {/* Right: countdown + actions */}
        <div className="text-right flex flex-col items-end gap-2 shrink-0">
          {urgency === 'overdue' ? (
            <div className="flex items-center gap-1.5 text-queens-red font-bold text-sm whitespace-nowrap">
              <Icon name="error" className="text-sm" />
              <span>{countdown}</span>
            </div>
          ) : (
            <div className={`flex items-center gap-1.5 ${style.countdown} font-bold text-sm whitespace-nowrap ${
              urgency === 'critical' ? 'bg-primary/10 px-3 py-1 rounded-full' : ''
            }`}>
              <Icon name={style.countdownIcon} className="text-sm" />
              <span>{countdown}</span>
            </div>
          )}
          <ContextMenu assignment={assignment} onHide={onHide} onComplete={onComplete} />
        </div>
      </div>
    </div>
  );
}

// ─── Assignment Grid Card ───
function AssignmentGridCard({
  assignment, onHide, onComplete,
}: Readonly<{ assignment: Assignment; onHide: (id: string) => void; onComplete: (id: string) => void }>) {
  const [countdown, setCountdown] = useState(formatCountdown(assignment.dueDate));
  const urgency = getUrgencyLevel(assignment.dueDate);
  const style = urgencyStyles[urgency];

  useEffect(() => {
    const interval = setInterval(() => setCountdown(formatCountdown(assignment.dueDate)), 1000);
    return () => clearInterval(interval);
  }, [assignment.dueDate]);

  const due = new Date(assignment.dueDate);
  const dateStr = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Toronto' });
  const timeStr = due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Toronto' });

  return (
    <div className={`group flex flex-col bg-queens-blue rounded-xl border border-white/5 overflow-hidden transition-all ${style.hoverBorder} hover:bg-queens-blue/80`}>
      <div className={`h-1.5 ${style.bar}`} />
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {urgency === 'overdue' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-queens-red text-white uppercase tracking-tighter shrink-0">Overdue</span>
            )}
            {urgency === 'critical' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-background-dark uppercase tracking-tighter shrink-0">Urgent</span>
            )}
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${style.badge} uppercase tracking-tighter shrink-0`}>
              {typeLabels[assignment.type]}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <CompleteButton id={assignment.id} onComplete={onComplete} />
            <ContextMenu assignment={assignment} onHide={onHide} onComplete={onComplete} />
          </div>
        </div>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">{assignment.courseCode}</span>
        <h3 className="text-white font-bold leading-snug group-hover:text-primary transition-colors line-clamp-2 flex-1">
          {assignment.title}
        </h3>
        <div className={`flex items-center gap-1.5 ${style.countdown} text-sm font-bold mt-auto pt-3 border-t border-white/5`}>
          <Icon name={style.countdownIcon} className="text-sm" />
          <span>{countdown}</span>
          <span className="ml-auto text-slate-500 text-xs font-normal">{dateStr} · {timeStr}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Course Filter Bar ───
function CourseFilterBar({
  courses,
  activeCourses,
  onToggle,
  onSelectAll,
}: Readonly<{
  courses: string[];
  activeCourses: Set<string>;
  onToggle: (code: string) => void;
  onSelectAll: () => void;
}>) {
  const allActive = courses.every(c => activeCourses.has(c));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* All toggle */}
      <button
        onClick={onSelectAll}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
          allActive
            ? 'bg-white/10 text-white border-white/20'
            : 'bg-transparent text-slate-400 border-white/10 hover:border-white/20 hover:text-white'
        }`}
      >
        <Icon name="apps" className="text-sm" />
        All
      </button>

      {/* Per-course toggles */}
      {courses.map(code => {
        const isClass = !NON_CLASS_CODES.has(code);
        const active = activeCourses.has(code);
        return (
          <button
            key={code}
            onClick={() => onToggle(code)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              active
                ? isClass
                  ? 'bg-queens-blue border-primary text-primary'
                  : 'bg-queens-blue border-slate-500 text-slate-300'
                : 'bg-transparent border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-400'
            }`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}

// ─── Stats Card ───
function StatCard({ label, value, subtitle, borderColor, labelColor, iconName, iconColor }: Readonly<{
  label: string; value: number; subtitle: string;
  borderColor: string; labelColor: string; iconName: string; iconColor: string;
}>) {
  return (
    <div className={`flex flex-col gap-2 rounded-xl p-6 bg-queens-blue border-y border-r border-white/5 shadow-xl ${borderColor}`}>
      <div className="flex justify-between items-start">
        <p className={`${labelColor} text-sm font-bold uppercase tracking-wider`}>{label}</p>
        <Icon name={iconName} className={iconColor} />
      </div>
      <p className="text-white text-4xl font-bold leading-tight">{value}</p>
      <div className="mt-2 text-xs text-slate-400">{subtitle}</div>
    </div>
  );
}

// ─── Calendar Sidebar ───
function CalendarSidebar({ assignments }: Readonly<{ assignments: Assignment[] }>) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = new Date();

  const assignmentsByDay = useMemo(() => {
    const map: Record<number, Assignment[]> = {};
    for (const a of assignments) {
      const d = new Date(a.dueDate);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(a);
      }
    }
    return map;
  }, [assignments, year, month]);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const dotColorMap = { overdue: 'bg-queens-red', critical: 'bg-primary', warning: 'bg-sky-400', normal: 'bg-slate-400' };
  const bgMap = { overdue: 'bg-queens-red/30', critical: 'bg-primary', warning: '', normal: '' };
  const textMap = { overdue: 'text-white font-bold', critical: 'text-background-dark font-bold', warning: 'text-white', normal: 'text-white' };

  return (
    <div className="bg-queens-blue rounded-xl border border-white/5 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-white font-bold text-lg">{monthName}</h3>
        <div className="flex gap-1">
          <button onClick={prevMonth} className="p-1 text-slate-400 hover:text-white"><Icon name="chevron_left" className="text-xl" /></button>
          <button onClick={nextMonth} className="p-1 text-slate-400 hover:text-white"><Icon name="chevron_right" className="text-xl" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-4 mb-4">
        {weekdays.map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-slate-500 uppercase">{d}</div>
        ))}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="text-center py-2" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dayAssignments = assignmentsByDay[day] || [];
          const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;

          if (dayAssignments.length > 0) {
            const mostUrgent = dayAssignments.reduce((prev, curr) => {
              const levels = { overdue: 0, critical: 1, warning: 2, normal: 3 };
              return levels[getUrgencyLevel(curr.dueDate)] < levels[getUrgencyLevel(prev.dueDate)] ? curr : prev;
            });
            const urg = getUrgencyLevel(mostUrgent.dueDate);
            return (
              <div key={day} className="flex flex-col items-center py-1" title={dayAssignments.map(a => a.title).join(', ')}>
                <span className={`text-sm w-8 h-8 flex items-center justify-center rounded-full ${bgMap[urg]} ${textMap[urg]}`}>{day}</span>
                <div className="flex gap-0.5 mt-0.5">
                  {dayAssignments.slice(0, 3).map((a, idx) => (
                    <div key={idx} className={`size-1 rounded-full ${dotColorMap[getUrgencyLevel(a.dueDate)]}`} />
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div key={day} className={`text-center py-2 text-sm ${isToday ? 'text-primary font-bold' : 'text-slate-400'}`}>
              {day}
            </div>
          );
        })}
      </div>

      <div className="mt-8 border-t border-white/5 pt-6">
        <h4 className="text-slate-300 font-semibold text-sm mb-4">Legend</h4>
        <div className="space-y-3">
          {[
            { color: 'bg-queens-red', label: 'Overdue / Critical' },
            { color: 'bg-primary', label: 'High Urgency (< 3 days)' },
            { color: 'bg-sky-400', label: 'Upcoming' },
            { color: 'bg-emerald-500', label: 'Completed' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={`size-2 rounded-full ${color}`} />
              <span className="text-xs text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 bg-primary/10 rounded-lg p-4">
        <p className="text-primary text-xs font-bold uppercase mb-1">Study Tip</p>
        <p className="text-slate-300 text-xs leading-relaxed">
          Focus on your most urgent deadlines first. Use the Pomodoro technique for maximum productivity.
        </p>
      </div>
    </div>
  );
}

// ─── Settings Panel ───
function SettingsPanel({ isOpen, onClose, feedUrl, onFeedUrlChange, onSync, onClear, syncing, lastSynced }: Readonly<{
  isOpen: boolean; onClose: () => void; feedUrl: string;
  onFeedUrlChange: (url: string) => void; onSync: () => void;
  onClear: () => void; syncing: boolean; lastSynced: string | null;
}>) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="rounded-2xl p-6 w-full max-w-lg animate-fade-in bg-background-dark border border-white/10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-slate-400">
            <Icon name="close" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-slate-400">ICS Calendar Feed URL</label>
            <input
              type="url"
              value={feedUrl}
              onChange={e => onFeedUrlChange(e.target.value)}
              placeholder="https://onq.queensu.ca/d2l/le/calendar/feed/user/feed.ics?token=..."
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border transition-colors focus:border-primary bg-queens-blue text-white border-white/10"
            />
            <p className="text-[11px] mt-1.5 text-slate-500">Find this in onQ → Calendar → Subscribe → Copy URL</p>
          </div>
          {lastSynced && (
            <p className="text-xs text-slate-500">
              Last synced: {new Date(lastSynced).toLocaleString('en-US', { timeZone: 'America/Toronto' })}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onSync}
              disabled={syncing || !feedUrl}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-40 bg-primary text-background-dark hover:scale-105 active:scale-95"
            >
              <Icon name="sync" className={`text-sm ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
            <button onClick={onClear} className="px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:bg-queens-red/10 border-queens-red text-queens-red">
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function Home() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [feedUrl, setFeedUrl] = useState(DEFAULT_FEED_URL);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<'dashboard' | 'calendar'>('dashboard');
  const [loaded, setLoaded] = useState(false);
  const [gridLayout, setGridLayout] = useState(false);

  // ─── Course filter state ───
  // Derived list of unique course codes from assignments
  const allCourseCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const a of assignments) codes.add(a.courseCode);
    return Array.from(codes).sort();
  }, [assignments]);

  // Active (visible) courses — class courses on by default, GENERAL off by default
  const [activeCourses, setActiveCourses] = useState<Set<string>>(new Set());
  const [courseFilterInitialized, setCourseFilterInitialized] = useState(false);

  // When assignments first load, initialize the active courses
  useEffect(() => {
    if (!courseFilterInitialized && allCourseCodes.length > 0) {
      const defaults = new Set(allCourseCodes.filter(c => !NON_CLASS_CODES.has(c)));
      setActiveCourses(defaults);
      setCourseFilterInitialized(true);
    }
  }, [allCourseCodes, courseFilterInitialized]);

  // When a new sync brings new course codes, add them (as active if they're classes)
  useEffect(() => {
    if (courseFilterInitialized && allCourseCodes.length > 0) {
      setActiveCourses(prev => {
        const next = new Set(prev);
        for (const code of allCourseCodes) {
          if (!prev.has(code) && !NON_CLASS_CODES.has(code)) next.add(code);
        }
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCourseCodes]);

  useEffect(() => {
    const state = loadState();
    if (state.assignments.length > 0) setAssignments(state.assignments);
    if (state.feedUrl) setFeedUrl(state.feedUrl);
    if (state.lastSynced) setLastSynced(state.lastSynced);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded && feedUrl && assignments.length === 0 && !syncing) handleSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const handleSync = useCallback(async () => {
    if (!feedUrl || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/ics?url=${encodeURIComponent(feedUrl)}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const icsText = await res.text();
      const parsed = parseICS(icsText);
      const merged = mergeAssignments(assignments, parsed);
      const now = new Date().toISOString();
      setAssignments(merged);
      setLastSynced(now);
      saveState({ feedUrl, lastSynced: now, assignments: merged });
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }, [feedUrl, syncing, assignments]);

  const handleHide = useCallback((id: string) => setHidden(prev => new Set([...prev, id])), []);

  const handleComplete = useCallback((id: string) => {
    setCompleted(prev => new Set([...prev, id]));
  }, []);

  const handleToggleCourse = useCallback((code: string) => {
    setActiveCourses(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }, []);

  const handleSelectAllCourses = useCallback(() => {
    setActiveCourses(new Set(allCourseCodes));
  }, [allCourseCodes]);

  const handleClear = () => { setAssignments([]); setLastSynced(null); clearState(); setCourseFilterInitialized(false); };
  const handleFeedUrlChange = (url: string) => { setFeedUrl(url); saveState({ feedUrl: url, lastSynced, assignments }); };

  // ─── Computed ───
  const now = new Date();
  const visibleAssignments = useMemo(
    () => assignments.filter(a => !hidden.has(a.id) && !completed.has(a.id)),
    [assignments, hidden, completed]
  );
  const activeAssignments = visibleAssignments.filter(a => new Date(a.dueDate) >= now);
  const overdueAssignments = visibleAssignments.filter(a => new Date(a.dueDate) < now);
  const dueTodayCount = activeAssignments.filter(a => new Date(a.dueDate).toDateString() === now.toDateString()).length;
  const dueThisWeekCount = activeAssignments.filter(a => new Date(a.dueDate) <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)).length;
  const nextDueThisWeek = activeAssignments.find(a => new Date(a.dueDate) <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));

  const displayAssignments = useMemo(() => {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return visibleAssignments
      .filter(a => {
        const afterCutoff = new Date(a.dueDate) >= sevenDaysAgo;
        const courseActive = activeCourses.has(a.courseCode);
        return afterCutoff && courseActive;
      })
      .sort((a, b) => {
        const aTime = new Date(a.dueDate).getTime();
        const bTime = new Date(b.dueDate).getTime();
        const aOverdue = aTime < now.getTime() ? 0 : 1;
        const bOverdue = bTime < now.getTime() ? 0 : 1;
        if (aOverdue !== bOverdue) return aOverdue - bOverdue;
        return aTime - bTime;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleAssignments, activeCourses]);

  // ─── Shared toolbar render ───
  const filterBar = allCourseCodes.length > 0 && (
    <div className="mb-6 p-4 bg-queens-blue/50 rounded-xl border border-white/5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filter by Course</span>
        <span className="text-xs text-slate-500">{displayAssignments.length} shown</span>
      </div>
      <CourseFilterBar
        courses={allCourseCodes}
        activeCourses={activeCourses}
        onToggle={handleToggleCourse}
        onSelectAll={handleSelectAllCourses}
      />
    </div>
  );

  const renderCards = (items: typeof displayAssignments) =>
    gridLayout ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((a, idx) => (
          <div key={a.id} className="animate-fade-in" style={{ animationDelay: `${idx * 30}ms` }}>
            <AssignmentGridCard assignment={a} onHide={handleHide} onComplete={handleComplete} />
          </div>
        ))}
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        {items.map((a, idx) => (
          <div key={a.id} className="animate-fade-in" style={{ animationDelay: `${idx * 30}ms` }}>
            <AssignmentCard assignment={a} onHide={handleHide} onComplete={handleComplete} />
          </div>
        ))}
      </div>
    );

  // Shared view toggle + grid buttons — identical size
  const viewButtons = (
    <div className="flex gap-2 items-center">
      <button
        onClick={() => setGridLayout(g => !g)}
        title={gridLayout ? 'List view' : 'Grid view'}
        className={`flex items-center justify-center size-9 rounded-lg border text-sm transition-colors ${
          gridLayout
            ? 'bg-primary text-background-dark border-primary'
            : 'bg-queens-blue text-white/70 hover:text-white border-white/10'
        }`}
      >
        <Icon name={gridLayout ? 'view_list' : 'grid_view'} className="text-xl" />
      </button>
    </div>
  );

  return (
    <div className="bg-background-dark text-slate-100 min-h-screen">
      {/* ─── Header ─── */}
      <header className="flex items-center justify-between whitespace-nowrap border-b border-white/10 bg-background-dark px-10 py-4 sticky top-0 z-40">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="size-8 flex items-center justify-center bg-primary rounded-lg text-background-dark">
              <Icon name="school" className="font-bold" />
            </div>
            <h2 className="text-white text-2xl font-bold leading-tight tracking-tight">QTracker</h2>
          </div>
          <nav className="flex items-center gap-6 ml-4">
            {(['dashboard', 'calendar'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={`text-sm font-semibold pb-1 transition-colors capitalize ${
                  view === tab ? 'text-white border-b-2 border-primary' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-background-dark text-sm font-bold transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <Icon name="sync" className={`text-sm ${syncing ? 'animate-spin' : ''}`} />
            <span>Sync onQ</span>
          </button>
          <button onClick={() => setSettingsOpen(true)} className="p-2 rounded-lg text-slate-400 hover:text-white transition-colors">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      {/* ─── Main ─── */}
      <main className="max-w-[1440px] mx-auto w-full px-10 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <StatCard label="Total Active" value={activeAssignments.length} subtitle={`${dueThisWeekCount} upcoming this week`} borderColor="border-l-4 border-l-white/20" labelColor="text-slate-400" iconName="list_alt" iconColor="text-white/40" />
          <StatCard label="Due Today" value={dueTodayCount} subtitle={dueTodayCount > 0 ? 'Urgent action required' : 'Nothing due today'} borderColor="border-l-4 border-l-queens-red" labelColor="text-queens-red" iconName="priority_high" iconColor="text-queens-red" />
          <StatCard label="This Week" value={dueThisWeekCount} subtitle={nextDueThisWeek ? `Next: ${nextDueThisWeek.courseCode} ${nextDueThisWeek.type}` : 'All clear'} borderColor="border-l-4 border-l-primary" labelColor="text-primary" iconName="calendar_today" iconColor="text-primary" />
          <StatCard label="Completed" value={completed.size} subtitle="Marked as done this session" borderColor="border-l-4 border-l-emerald-500" labelColor="text-emerald-500" iconName="check_circle" iconColor="text-emerald-500" />
        </div>

        {view === 'dashboard' ? (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Assignment list */}
            <div className="flex-1 min-w-0">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white text-2xl font-bold">Upcoming Assignments</h2>
                {viewButtons}
              </div>

              {/* Course filter chips */}
              {filterBar}

              {!loaded ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-queens-blue animate-pulse" />)}
                </div>
              ) : displayAssignments.length === 0 ? (
                <div className="text-center py-16 bg-queens-blue rounded-xl border border-white/5">
                  <Icon name="event_available" className="text-5xl text-slate-500 mb-3" />
                  <h3 className="text-lg font-semibold text-white mb-1">No assignments found</h3>
                  <p className="text-sm text-slate-400">Try enabling more courses above, or sync your calendar.</p>
                </div>
              ) : renderCards(displayAssignments)}
            </div>

            {/* Sticky Calendar Sidebar */}
            <aside className="w-full lg:w-[320px] shrink-0">
              <div className="sticky top-24">
                <CalendarSidebar assignments={visibleAssignments} />
              </div>
            </aside>
          </div>
        ) : (
          /* ─── Calendar View ─── */
          <div className="flex flex-col lg:flex-row gap-8 items-start">
            <div className="w-full lg:w-[360px] shrink-0 sticky top-24 self-start">
              <CalendarSidebar assignments={visibleAssignments} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white text-2xl font-bold">All Assignments</h2>
                {viewButtons}
              </div>
              {filterBar}
              {displayAssignments.length === 0 ? (
                <div className="text-center py-16 bg-queens-blue rounded-xl border border-white/5">
                  <Icon name="event_available" className="text-5xl text-slate-500 mb-3" />
                  <h3 className="text-lg font-semibold text-white mb-1">No assignments yet</h3>
                  <p className="text-sm text-slate-400">Click Sync to fetch your onQ calendar feed.</p>
                </div>
              ) : renderCards(displayAssignments)}
            </div>
          </div>
        )}
      </main>

      {/* Mobile FAB */}
      <div className="fixed bottom-8 right-10 lg:hidden">
        <button onClick={handleSync} className="size-14 rounded-full bg-primary shadow-2xl flex items-center justify-center text-background-dark">
          <Icon name="sync" className="text-3xl font-bold" />
        </button>
      </div>

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        feedUrl={feedUrl}
        onFeedUrlChange={handleFeedUrlChange}
        onSync={() => { handleSync(); setSettingsOpen(false); }}
        onClear={() => { handleClear(); setSettingsOpen(false); }}
        syncing={syncing}
        lastSynced={lastSynced}
      />
    </div>
  );
}
