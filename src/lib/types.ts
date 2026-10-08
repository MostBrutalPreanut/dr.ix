export interface Doc {
  id: string;
}

export type Role = 'manager' | 'staff';

export interface Employee extends Doc {
  name: string;
  role: Role;
  pinHash: string;
  mustChangePin: boolean;
  inventoryEditor?: boolean;
  createdAt: string;
}

/** What the app knows about a colleague - never includes the PIN or its hash. */
export interface PublicEmployee {
  id: string;
  name: string;
  role: Role;
  /** Only known after sign-in. */
  mustChangePin?: boolean;
  /** May edit the inventory list although not a manager. */
  inventoryEditor?: boolean;
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
  /** optional English version of the text */
  textEn?: string;
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
  textEn?: string;
  detailEn?: string;
}

export interface ChecklistGroup {
  id: string;
  title: string;
  titleEn?: string;
  items: ChecklistItem[];
}

export interface Checklist extends Doc {
  title: string;
  titleEn?: string;
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
  /** optional English version, shown when the app is in English */
  titleEn?: string;
  descriptionEn?: string;
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
  /** Shelf number (free text, e.g. "12" or "B3") - empty = not set */
  shelf?: string;
  nameEn?: string;
  notesEn?: string;
}

export interface Settings extends Doc {
  /** Any date inside a "week A" of the two-week cleaning cycle (YYYY-MM-DD). */
  biweeklyAnchor: string;
  /** First day the app was in use - tasks before it are never shown as late. */
  startDate?: string;
}

// ---------- inventory ----------

export type StockLevel = 'ok' | 'low' | 'out';

export const LEVEL_LABEL: Record<StockLevel, string> = {
  ok: 'מספיק',
  low: 'מעט',
  out: 'נגמר',
};

/**
 * How an item is reported:
 *  - status: enough / low / out
 *  - count : a number (with an optional unit and a "low" threshold)
 *  - photo : only a photo is asked for ("please photograph the back fridge")
 */
export type InventoryMode = 'status' | 'count' | 'photo';

export interface InventoryItem extends Doc {
  name: string;
  category: string;
  mode: InventoryMode;
  /** optional English versions, shown when the app is in English */
  nameEn?: string;
  categoryEn?: string;
  hintEn?: string;
  unitEn?: string;
  /** count mode: what is counted ("crates", "bags") */
  unit?: string;
  /** count mode: at or below this amount the item counts as low (0 is always "out") */
  min?: number;
  /** weekdays (0 = Sunday) on which it is checked; empty = every day */
  days: number[];
  /** shown under the name, e.g. "more than 5 sleeves" */
  hint?: string;
  /** also ask for a photo */
  photo?: boolean;
  active: boolean;
  order: number;
}

/** One answer for one item on one business day. id = `${date}|${itemId}` */
export interface InventoryReport extends Doc {
  date: string;
  itemId: string;
  level?: StockLevel;
  count?: number;
  note?: string;
  /** a photo for this answer exists (the picture itself is loaded on demand) */
  photo?: boolean;
  /** somebody bought it - overrides a low / out answer */
  restocked?: boolean;
  by: string;
  at: string;
}

/** id = `${date}|${itemId}` - kept apart from the report so lists stay small */
export interface InventoryPhoto extends Doc {
  date: string;
  itemId: string;
  dataUrl: string;
  by: string;
  at: string;
}

// ---------- tips ----------

/** One amount somebody put in at the end of a shift. id = `${date}|${uuid}` */
export interface TipEntry extends Doc {
  date: string;
  amount: number;
  by: string;
  at: string;
}

/** Somebody who worked on that business day (and shares the day's tips). id = `${date}|${employeeId}` */
export interface TipWorkerDoc extends Doc {
  date: string;
  employeeId: string;
  /** reinforcement worker: share = hours / full shift */
  reinforcement?: boolean;
  hours?: number;
  by: string;
  at: string;
}


// ---------- work schedule ----------

/** One shift of a day (a regular one, or a special event when `event` is set). */
export interface ShiftDef {
  /** 'eve' / 'noon' for the regular ones, `ev-...` for events */
  id: string;
  /** "ערב", "צהריים" or the event's name */
  label: string;
  labelEn?: string;
  /** opening hours of the shift (shown to everyone) */
  from?: string;
  to?: string;
  /** start time a worker gets when added to the shift (each worker's own time can differ) */
  defaultStart: string;
  /** how many workers fit (up to 4) */
  max: number;
  event?: boolean;
}

/** A day that differs from the weekly template (closed, other hours, a note, an event). id = date */
export interface ShiftDay extends Doc {
  date: string;
  shifts: ShiftDef[];
  note?: string;
  noteEn?: string;
}

/** Draft assignment (managers only). id = `${date}|${shiftId}|${employeeId}` */
export interface ShiftAssignment extends Doc {
  date: string;
  shiftId: string;
  employeeId: string;
  start: string;
}

export interface PublishedShift extends ShiftDef {
  staff: { employeeId: string; start: string }[];
}

export interface PublishedDay {
  date: string;
  note?: string;
  noteEn?: string;
  shifts: PublishedShift[];
}

/** What the team sees: a snapshot of one week, written when a manager publishes. id = weekStart (Sunday) */
export interface PublishedWeek extends Doc {
  weekStart: string;
  days: PublishedDay[];
  publishedAt: string;
  by: string;
}

/** What one person asked for next week. id = `${weekStart}|${employeeId}`; shifts = `${date}|${shiftId}` */
export interface ShiftRequest extends Doc {
  weekStart: string;
  employeeId: string;
  shifts: string[];
  note?: string;
  at: string;
}
