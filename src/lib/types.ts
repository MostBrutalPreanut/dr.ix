export interface Doc {
  id: string;
}

export type Role = 'manager' | 'staff';

export interface Employee extends Doc {
  name: string;
  role: Role;
  pinHash: string;
  mustChangePin: boolean;
  createdAt: string;
}

/** What the app knows about a colleague - never includes the PIN or its hash. */
export interface PublicEmployee {
  id: string;
  name: string;
  role: Role;
  /** Only known after sign-in. */
  mustChangePin?: boolean;
  createdAt?: string;
}

export type Area = 'all' | 'front' | 'kitchen' | 'bar';

export const AREA_LABEL: Record<Area, string> = {
  all: 'כולם',
  front: 'פרונט',
  kitchen: 'מטבח',
  bar: 'בר',
};

/** Shift note written by a manager for a specific business day. */
export interface Note extends Doc {
  date: string; // YYYY-MM-DD (business day)
  text: string;
  area: Area;
  urgent: boolean;
  createdBy: string; // employee id
  createdAt: string;
}

/** A colleague confirmed they read a note. id = `${date}|${noteId}|${employeeId}` */
export interface NoteAck extends Doc {
  date: string;
  noteId: string;
  employeeId: string;
  at: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  detail?: string;
}

export interface ChecklistGroup {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface Checklist extends Doc {
  title: string;
  icon: string;
  order: number;
  groups: ChecklistGroup[];
}

/**
 * One ticked item on one business day. Every tick is its own document so two people working
 * on the same list at the same time never overwrite each other.
 * id = `${date}|${checklistId}|${itemId}`
 */
export interface ChecklistCheck extends Doc {
  date: string;
  checklistId: string;
  itemId: string;
  by: string;
  at: string;
}

/** A checklist that was signed off for the day. id = `${date}|${checklistId}` */
export interface ChecklistClosure extends Doc {
  date: string;
  checklistId: string;
  by: string;
  at: string;
}

export interface Task extends Doc {
  title: string;
  description: string;
  weekday: number; // 0 = Sunday ... 6 = Saturday
  everyNWeeks: 1 | 2;
  weekOffset: 0 | 1; // which week of the cycle (only for everyNWeeks = 2)
  active: boolean;
  order: number;
}

/** id = `${dueDate}|${taskId}` */
export interface TaskCompletion extends Doc {
  taskId: string;
  dueDate: string;
  by: string;
  at: string;
}

export interface HandbookSection extends Doc {
  title: string;
  icon: string;
  category: string;
  order: number;
  body: string; // markdown
}

export type GameStyle = 'funny' | 'strategy' | 'coop' | 'family';
export type Difficulty = 'easy' | 'medium' | 'hard';

export const STYLE_LABEL: Record<GameStyle, string> = {
  funny: 'צחוקים',
  strategy: 'אסטרטגי',
  coop: 'שיתופי',
  family: 'משפחתי / ילדים',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'מורכב',
};

export interface Game extends Doc {
  name: string;
  minPlayers: number;
  maxPlayers: number;
  minAge?: number; // empty = unknown
  styles: GameStyle[];
  difficulty: Difficulty;
  durationMin?: number;
  notes?: string;
  featured?: boolean; // "must know" - ranked higher in recommendations
}

export interface Settings extends Doc {
  /** Any date inside a "week A" of the two-week cleaning cycle (YYYY-MM-DD). */
  biweeklyAnchor: string;
  /** First day the app was in use - tasks before it are never shown as late. */
  startDate?: string;
}
