import type { Difficulty, Game, GameStyle } from '../lib/types';

const E: Difficulty = 'easy';
const M: Difficulty = 'medium';

// Compact row: [name, minPlayers, maxPlayers, styles, difficulty, notes?, featured?]
// Source: the "רשימת משחקים להכיר" chapter of the staff handbook. Max players and difficulty
// are from the handbook; minimum players and style tags are a first estimate for the
// managers to review in the editor. Minimum age is left empty on purpose.
type Row = [string, number, number, GameStyle[], Difficulty, string?, boolean?];

const F: GameStyle[] = ['funny'];
const S: GameStyle[] = ['strategy'];
const C: GameStyle[] = ['coop'];
const K: GameStyle[] = ['family'];

const ROWS: Row[] = [
  // party games - funny
  ['קלפים ללא גבולות (Cards Against Humanity)', 3, 12, F, E],
  ['מימצחיק יותר (What Do You Meme)', 3, 12, F, E],
  ['אליאס', 4, 10, F, E],
  ['חרטטוני', 3, 10, F, E],
  ['היטסטר (Hitster)', 2, 8, F, E],
  ['תפוס ת\'מיקרופון (Grab the Mic)', 3, 10, F, E],
  ['הזיקית (The Chameleon)', 3, 8, F, E],
  ['לך עם העדר (Herd Mentality)', 4, 20, F, E],
  ['Hues and Cues', 3, 10, F, E],
  ['Telestrations', 4, 12, F, E],
  ['Wavelength', 2, 12, F, E],
  ['חוק ה-5 שניות', 3, 8, F, E],
  ['פליפ 7 (Flip 7)', 3, 10, F, E],
  ['איש זאב ללילה אחד', 3, 10, F, M],
  ['סיקרט היטלר', 5, 10, F, M],
  // party games - strategic / communication
  ['דיקסיט', 3, 12, S, E],
  ['שם-קוד (מילים, תמונות, דיסני, דואל)', 4, 12, S, E],
  ['במילה אחת (Just One)', 3, 8, C, E],
  ['החוש השישי (The Mind)', 2, 6, C, E],
  ['Cash and Guns', 4, 8, S, M],
  ['7 הפלאים', 3, 7, S, M],
  ['Between Two Cities', 3, 7, S, M],
  ['No Thanks!', 3, 7, S, E],
  // two players
  ['המבוך', 2, 2, K, E],
  ['קוויקסו', 2, 2, S, E],
  ['סנטוריני', 2, 2, S, E],
  ['בופ', 2, 2, S, E],
  ['אוניטאמה', 2, 2, S, E],
  ['אוקיה', 2, 2, S, E],
  ['מיקרו מאקרו', 1, 2, C, E],
  // strategy, up to 4-5 players
  ['ספלנדור', 2, 4, S, E, 'חובה להכיר! שער כניסה למשחקי אסטרטגיה.', true],
  ['בוננזה', 3, 4, S, M],
  ['אזול', 2, 4, S, M],
  ['קסקדיה', 2, 4, S, M],
  ['הרמוניז', 2, 4, S, M],
  ['סנטורי', 2, 5, S, E],
  ['הנאבי', 2, 5, C, E],
  ['The Gang', 3, 6, C, E],
  ['קריפטיד', 3, 5, S, E],
  ['טיקט טו רייד', 2, 5, S, E],
  ['סקאל', 3, 6, S, E],
  ['פנדמיק', 2, 5, C, M],
  ['קטאן', 3, 4, S, M, 'לא חובה לדעת ללמד.'],
  // light games for families and kids
  ['ג\'נגה', 1, 20, K, E, 'קלאסי. כמה שרוצים.'],
  ['ג\'אנגל ספיד', 2, 8, K, E],
  ['וונקי', 2, 6, K, E],
  ['מאץ\' מאדנס', 2, 4, K, E],
  ['סט', 1, 8, K, E],
  ['בננהגרמז', 2, 4, K, E],
  ['Tsuro', 2, 8, K, E],
  ['רמז Duck', 2, 4, K, E],
  ['נדל"ן בקטן', 2, 4, K, E],
  ['סיפור בקוביות', 1, 10, K, E],
  ['רמיקוב', 2, 4, K, E, 'קלאסי.'],
  ['חתולים מתפוצצים', 2, 5, K, E],
  ['טאקי', 2, 6, K, E],
  ['המבוך הקסום', 2, 4, K, E],
];

export const seedGames = (): Game[] =>
  ROWS.map(([name, minPlayers, maxPlayers, styles, difficulty, notes, featured], i) => ({
    id: `game-${String(i + 1).padStart(3, '0')}`,
    name,
    minPlayers,
    maxPlayers,
    styles,
    difficulty,
    ...(notes ? { notes } : {}),
    ...(featured ? { featured } : {}),
  }));
