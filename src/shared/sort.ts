import type { Note, Task } from './types'

/**
 * 0 重要且紧急 / 1 紧急 / 2 重要 / 3 普通
 */
export type PriorityTier = 0 | 1 | 2 | 3

export function priorityTier(task: Pick<Task | Note, 'important' | 'urgent'>): PriorityTier {
  if (task.important && task.urgent) return 0
  if (task.urgent) return 1
  if (task.important) return 2
  return 3
}

export const PRIORITY_LABELS: Record<PriorityTier, string> = {
  0: '重要且紧急',
  1: '紧急',
  2: '重要',
  3: '普通'
}

export function isArchived(item: Pick<Task | Note, 'archivedAt'>): boolean {
  return item.archivedAt !== null
}

function timeValue(value: string): number {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER
}

interface PriorityItem {
  id: string
  important: boolean
  urgent: boolean
  createdAt: string
}

function byPriority<T extends PriorityItem>(a: T, b: T): number {
  const tierDiff = priorityTier(a) - priorityTier(b)
  if (tierDiff !== 0) return tierDiff
  const createdDiff = timeValue(a.createdAt) - timeValue(b.createdAt)
  if (createdDiff !== 0) return createdDiff
  return a.id.localeCompare(b.id)
}

/**
 * 重要且紧急 > 仅紧急 > 仅重要 > 普通；同级按创建时间从早到晚。
 */
export function sortActiveTasks(tasks: readonly Task[]): Task[] {
  return tasks
    .filter((task) => !isArchived(task))
    .slice()
    .sort(byPriority)
}

/** 随记沿用待办的优先级与创建时间排序。 */
export function sortActiveNotes(notes: readonly Note[]): Note[] {
  return notes
    .filter((note) => !isArchived(note))
    .slice()
    .sort(byPriority)
}

/** 随记归档区按归档时间从新到旧。 */
export function sortArchivedNotes(notes: readonly Note[]): Note[] {
  return notes
    .filter(isArchived)
    .slice()
    .sort((a, b) => {
      const archivedDiff = timeValue(b.archivedAt ?? '') - timeValue(a.archivedAt ?? '')
      if (archivedDiff !== 0) return archivedDiff
      return a.id.localeCompare(b.id)
    })
}

/** 归档区按归档时间从新到旧。 */
export function sortArchivedTasks(tasks: readonly Task[]): Task[] {
  return tasks
    .filter(isArchived)
    .slice()
    .sort((a, b) => {
      const archivedDiff = timeValue(b.archivedAt ?? '') - timeValue(a.archivedAt ?? '')
      if (archivedDiff !== 0) return archivedDiff
      return a.id.localeCompare(b.id)
    })
}
