import type { Settings, Task } from '../lib/types';
import { businessDate } from '../lib/dates';

type Row = [weekday: number, title: string, everyNWeeks?: 1 | 2];

// From the printed "Cleaning Planner". Weekday: 0 = Sunday ... 6 = Saturday.
const ROWS: Row[] = [
  [1, 'מדפי אחסון (כלים / כוסות / פיצה)'],
  [1, 'השקיית צמחים'],
  [1, 'ניקוי מתחת לכיור', 2],
  [1, 'ריקון המדיח', 2],

  [2, 'איסוף קרח'],
  [2, 'מקרר ירקות (חדר אחורי)'],
  [2, 'מדפים מתחת לשולחנות המשחקים'],
  [2, 'חדר VIP'],

  [3, 'דלת כניסה וחלונות'],
  [3, 'טאטוא הכניסה הקדמית'],
  [3, 'מדפי המשחקים העליונים'],
  [3, 'ניקוי מאווררים', 2],

  [4, 'מקררים קדמיים'],
  [4, 'פתחי אוורור בשירותים'],

  [5, 'משטח הבר'],
  [5, 'מראות'],

  [6, 'מדרגות'],
  [6, 'שטיפת רצפה'],
  [6, 'החלפת שטיחי בר'],
];

export const seedTasks = (): Task[] =>
  ROWS.map(([weekday, title, every], i) => ({
    id: `task-${String(i + 1).padStart(2, '0')}`,
    title,
    description: '',
    weekday,
    everyNWeeks: every ?? 1,
    weekOffset: 0,
    active: true,
    order: i,
  }));

export const seedSettings = (): Settings[] => [{ id: 'settings', biweeklyAnchor: businessDate(), startDate: businessDate() }];
