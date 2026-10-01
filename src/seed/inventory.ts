import type { InventoryItem, InventoryMode } from '../lib/types';

// Starting list, from the weekly stock sheet ("במקרר יש", Monday, two Saturday blocks).
// Everything here can be changed in the app: Management -> Inventory.
//   [name, category, mode, days, extras]
type Extras = { unit?: string; min?: number; hint?: string; photo?: boolean };
type Row = [string, string, InventoryMode, number[], Extras?];

const FRIDGE = 'מקרר';
const BAR = 'בר ומשקאות';
const KITCHEN = 'מטבח ומקפיאים';
const SUPPLIES = 'ציוד מתכלה';
const MON = [1];
const SAT = [6];

const ROWS: Row[] = [
  // every day: the fridge
  ['חלב רגיל', FRIDGE, 'count', [], { unit: 'קרטונים' }],
  ['עגבניות', FRIDGE, 'status', []],
  ['עגבניות שרי', FRIDGE, 'status', []],
  ['חסה', FRIDGE, 'status', []],
  ['לימונים', FRIDGE, 'status', []],
  ['בצל סגול', FRIDGE, 'status', []],
  ['מלפפונים', FRIDGE, 'status', []],
  ['פטריות', FRIDGE, 'status', []],
  ['גזר', FRIDGE, 'status', []],
  ["צ'ילי", FRIDGE, 'status', []],
  ['בזיליקום', FRIDGE, 'status', [], { hint: 'האם נראה בסדר?' }],
  ['נענע', FRIDGE, 'status', [], { hint: 'האם נראה בסדר?' }],
  ['שקיות קרח', FRIDGE, 'count', [], { unit: 'שקיות' }],

  // Monday: bar
  ['חביות בירה מלאות - שבט', BAR, 'count', MON, { unit: 'חביות' }],
  ['חביות בירה מלאות - טוכר וויס', BAR, 'count', MON, { unit: 'חביות' }],
  ['חביות בירה מלאות - שושנע', BAR, 'count', MON, { unit: 'חביות' }],
  ['ארגזי ובקבוקי קסטיל דובדבן', BAR, 'count', MON, { unit: 'ארגזים' }],
  ['ארגזי ובקבוקי קסטיל טרופי', BAR, 'count', MON, { unit: 'ארגזים' }],
  ['מיכלי גז מלאים מאחורה', BAR, 'count', MON, { unit: 'מיכלים' }],
  ['מקרר אחורי - בצק וקמח', KITCHEN, 'photo', MON, { hint: 'נא לצלם' }],

  // Saturday: kitchen and freezers
  ["ארגז ג'חנון", KITCHEN, 'count', SAT, { unit: 'ארגזים' }],
  ['שקיות מוצרלה קפואה', KITCHEN, 'count', SAT, { unit: 'שקיות' }],
  ["ארגז נאצ'וס טבעי", KITCHEN, 'count', SAT, { unit: 'ארגזים' }],
  ["ארגז נאצ'וס ברביקיו", KITCHEN, 'count', SAT, { unit: 'ארגזים' }],
  ["ג'ריקן רוטב סלסה", KITCHEN, 'count', SAT, { unit: "ג'ריקנים" }],
  ['עוגיות אמסטרדם קפואות', KITCHEN, 'status', SAT, { hint: 'יש 10 קפואות?' }],
  ['עוגיות חמאת בוטנים קפואות', KITCHEN, 'status', SAT, { hint: 'יש 10 קפואות?' }],
  ['זיתי קלמטה', KITCHEN, 'status', SAT, { hint: 'יש פחות מרבע?' }],
  ['גבינת בושה', KITCHEN, 'status', SAT],
  ['פטה יוונית', KITCHEN, 'status', SAT],
  ['כדורי מוצרלה', KITCHEN, 'status', SAT, { hint: 'יש קופסה מאחורה?' }],
  ['קפה', KITCHEN, 'status', SAT, { hint: 'חצי שקית?' }],
  ['מצב טמפו', KITCHEN, 'photo', SAT, { hint: 'נא לצלם' }],
  ['מצב קמח במקפיאים', KITCHEN, 'photo', SAT, { hint: 'נא לצלם' }],
  ['מצב אלכוהול כבד', BAR, 'photo', SAT, { hint: 'נא לצלם' }],
  ['חלב סויה', FRIDGE, 'status', SAT, { hint: 'אם יש קופסה סגורה - מספיק' }],
  ['חלב שיבולת שועל', FRIDGE, 'status', SAT, { hint: 'אם יש קופסה סגורה - מספיק' }],

  // Saturday: supplies
  ['נייר טואלט', SUPPLIES, 'status', SAT, { hint: 'יש אחד סגור' }],
  ['נייר צץ-רץ', SUPPLIES, 'status', SAT, { hint: 'יש ארגז סגור' }],
  ['מפיות עריכה 40X40', SUPPLIES, 'status', SAT, { hint: 'יש יותר מ-4 בנדלים' }],
  ['כוסות פופקורן 46oz', SUPPLIES, 'status', SAT, { hint: 'יש יותר מ-5 שרוולים' }],
  ['נייר מטבח', SUPPLIES, 'status', SAT, { hint: 'יש אחד סגור' }],
  ['נייר תרמי לקופה', SUPPLIES, 'status', SAT, { hint: 'יש יותר ממארז (של 4)' }],
  ['כוסות בירה שליש פלסטיק', SUPPLIES, 'status', SAT, { hint: 'יש יותר מ-5 שרוולים' }],
  ['כפפות S/M/L', SUPPLIES, 'status', SAT, { hint: 'יש יותר מ-3 קופסאות (אם לא, פרט)' }],
  ['מגבונים לחים באריזות אישיות', SUPPLIES, 'status', SAT],
  ['תבלין לפיצה בשקיות אישיות', SUPPLIES, 'status', SAT],
  ['קופסאות לפיצה', SUPPLIES, 'status', SAT, { hint: 'יש יותר מ-10' }],
  ['נייר פרגמנט (עיתון) לצלחות 30X40', SUPPLIES, 'status', SAT, { hint: 'יש יותר מחצי קופסה בערך' }],
];

export const seedInventory = (): InventoryItem[] =>
  ROWS.map(([name, category, mode, days, extra], i) => ({
    id: `inv-${String(i + 1).padStart(3, '0')}`,
    name,
    category,
    mode,
    days,
    active: true,
    order: (i + 1) * 10,
    ...extra,
  }));
