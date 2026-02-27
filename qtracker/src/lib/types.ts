export type TaskType = 'assignment' | 'midterm' | 'exam' | 'quiz' | 'lecture' | 'other';

export type UrgencyLevel = 'overdue' | 'critical' | 'warning' | 'normal';

export interface Assignment {
  id: string;
  title: string;
  courseCode: string;
  courseName: string;
  dueDate: string; // ISO string
  description: string;
  location: string;
  type: TaskType;
  isAllDay: boolean;
}

export interface SyncState {
  lastSynced: string | null; // ISO string
  feedUrl: string;
  assignments: Assignment[];
}
