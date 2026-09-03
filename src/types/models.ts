export type Frequency =
  | 'once'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'no_repeat'

export type Priority = 0 | 1 | 2 | 3 | 4

export type ChoreStatus = 'none' | 'in_progress' | 'paused'

export interface Subtask {
  id: string
  title: string
  completed: boolean
  parentId?: string | null
  dueAt?: string | null
}

export interface Chore {
  id: string
  title: string
  description: string
  priority: Priority
  status: ChoreStatus
  dueAt: string | null
  isRolling: boolean
  frequency: Frequency
  /** Every N periods (default 1). */
  repeatEvery: number
  /** For weekly: days 0=Sun … 6=Sat. Empty = weekday of due/complete. */
  repeatWeekdays: number[]
  labelIds: string[]
  projectId: string | null
  subtasks: Subtask[]
  reminderEnabled: boolean
  predueHours: number
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  lastCompletedAt: string | null
  /** Subtask list metadata when chore represents a checklist item in task lists */
  isSubtask?: boolean
  parentChoreId?: string
  parentChoreTitle?: string
  subtaskId?: string
}

export interface Label {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

export type ChoreBucket =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'next7'
  | 'laterMonth'
  | 'future'
  | 'anytime'

export interface NotificationSettings {
  timezone: string
  morningDigestEnabled: boolean
  /** Local hour 0–23; default 8. */
  morningDigestHour: number
  morningDigestMinute: number
  dueRemindersEnabled: boolean
  predueRemindersEnabled: boolean
  overdueNudgeEnabled: boolean
}

/** Snapshot used to undo a complete. */
export type ChoreCompleteSnapshot = Pick<
  Chore,
  'dueAt' | 'archivedAt' | 'subtasks' | 'lastCompletedAt' | 'updatedAt' | 'status'
>

export interface CustomView {
  id: string
  name: string
  priorities: Priority[]
  labelIds: string[]
  createdAt: string
  updatedAt: string
}
