import { useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { newId, useCollection } from '../lib/db';
import { recommend } from '../lib/games';
import { DIFFICULTY_LABEL, STYLE_LABEL } from '../lib/types';
import type { Difficulty, Game, GameStyle } from '../lib/types';
import { seedGames } from '../seed/games';

const STYLES = Object.keys(STYLE_LABEL) as GameStyle[];
const DIFFICULTIES = Object.keys(DIFFICULTY_LABEL) as Difficulty[];
const DIFF_DOT: Record<Difficulty, string> = { easy: '🟢', medium: '🟠', hard: '🔴' };
const PAGE = 5;

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function GameCard({ game, onEdit }: { game: Game; onEdit?: () => void }) {
  return (
    <article className="card game">
      <div className="game-head">
        <h3>
          {game.featured && <span title="חובה להכיר">⭐ </span>}
          {game.name}
        </h3>
        {onEdit && (
          <button type="button" className="small" onClick={onEdit} aria-label={`עריכת ${game.name}`}>
            ✏️
          </button>
        )}
      </div>
      <div className="chips">
        <span className="chip">
          👥 {game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers}-${game.maxPlayers}`}
        </span>
        <span className="chip">{game.minAge !== undefined ? `גיל ${game.minAge}+` : 'גיל: לא הוגדר'}</span>
        <span className="chip">
          {DIFF_DOT[game.difficulty]} {DIFFICULTY_LABEL[game.difficulty]}
        </span>
        {game.styles.map((s) => (
          <span key={s} className="chip soft">
            {STYLE_LABEL[s]}
          </span>
        ))}
        {game.durationMin !== undefined && <span className="chip">⏱ {game.durationMin} דק'</span>}
      </div>
      {game.notes && <p className="muted small-text">{game.notes}</p>}
    </article>
  );
}

export default function Games() {
  const { isManager } = useAuth();
  const { items, loading, save, remove } = useCollection<Game>('games', seedGames);
  const [tab, setTab] = useState<'recommend' | 'all'>('recommend');
  const [players, setPlayers] = useState(4);
  const [age, setAge] = useState('');
  const [styles, setStyles] = useState<GameStyle[]>([]);
  const [difficulties, setDifficulties] = useState<Difficulty[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Game | null>(null);

  const matches = useMemo(
    () => recommend(items, { players, youngestAge: age === '' ? undefined : Number(age), styles, difficulties }),
    [items, players, age, styles, difficulties],
  );

  const all = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...items]
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [items, search]);

  if (editing) {
    return (
      <GameEditor
        game={editing}
        isNew={!items.some((g) => g.id === editing.id)}
        onCancel={() => setEditing(null)}
        onSave={async (g) => {
          await save(g);
          setEditing(null);
        }}
        onDelete={async () => {
          if (confirm(`למחוק את "${editing.name}"?`)) {
            await remove(editing.id);
            setEditing(null);
          }
        }}
      />
    );
  }

  const edit = isManager ? (g: Game) => () => setEditing(g) : undefined;

  return (
    <>
      <div className="section-head">
        <h1>🎲 משחקים</h1>
        {isManager && (
          <button
            type="button"
            className="small"
            onClick={() => setEditing({ id: newId(), name: '', minPlayers: 2, maxPlayers: 4, styles: [], difficulty: 'easy' })}
          >
            + משחק חדש
          </button>
        )}
      </div>

      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'recommend'} className={tab === 'recommend' ? 'on' : ''} onClick={() => setTab('recommend')}>
          המלצה מהירה
        </button>
        <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
          כל המשחקים ({items.length})
        </button>
      </div>

      {loading && <p className="muted">טוען…</p>}

      {tab === 'recommend' ? (
        <>
          <div className="card form">
            <div className="row between">
              <span>כמה אורחים?</span>
              <div className="stepper">
                <button type="button" aria-label="פחות" onClick={() => { setPlayers((p) => Math.max(1, p - 1)); setShown(PAGE); }}>−</button>
                <output aria-live="polite">{players}</output>
                <button type="button" aria-label="יותר" onClick={() => { setPlayers((p) => Math.min(30, p + 1)); setShown(PAGE); }}>+</button>
              </div>
            </div>
            <label className="row between">
              <span>הגיל של הצעיר ביותר</span>
              <input
                className="age"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={age}
                placeholder="לא משנה"
                onChange={(e) => { setAge(e.target.value); setShown(PAGE); }}
              />
            </label>
            <div>
              <span className="label">סגנון</span>
              <div className="chips">
                {STYLES.map((s) => (
                  <button key={s} type="button" className={`chip pick${styles.includes(s) ? ' on' : ''}`} aria-pressed={styles.includes(s)} onClick={() => { setStyles(toggle(styles, s)); setShown(PAGE); }}>
                    {STYLE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">רמת קושי</span>
              <div className="chips">
                {DIFFICULTIES.map((d) => (
                  <button key={d} type="button" className={`chip pick${difficulties.includes(d) ? ' on' : ''}`} aria-pressed={difficulties.includes(d)} onClick={() => { setDifficulties(toggle(difficulties, d)); setShown(PAGE); }}>
                    {DIFF_DOT[d]} {DIFFICULTY_LABEL[d]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="muted small-text">
            {matches.length === 0 ? 'אין משחק שמתאים לבחירה. נסו להסיר סינון.' : `${matches.length} משחקים מתאימים. הנה המומלצים:`}
          </p>
          {matches.slice(0, shown).map((g) => (
            <GameCard key={g.id} game={g} onEdit={edit?.(g)} />
          ))}
          {matches.length > shown && (
            <button type="button" className="wide" onClick={() => setShown((n) => n + PAGE)}>
              עוד המלצות
            </button>
          )}
        </>
      ) : (
        <>
          <input className="search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש משחק" aria-label="חיפוש משחק" />
          {all.map((g) => (
            <GameCard key={g.id} game={g} onEdit={edit?.(g)} />
          ))}
        </>
      )}
    </>
  );
}

function GameEditor({
  game,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  game: Game;
  isNew: boolean;
  onSave(g: Game): Promise<void>;
  onCancel(): void;
  onDelete(): Promise<void>;
}) {
  const [g, setG] = useState(game);
  const num = (v: string): number | undefined => (v === '' ? undefined : Number(v));
  const valid = g.name.trim() && g.minPlayers >= 1 && g.maxPlayers >= g.minPlayers;

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const clean: Game = { ...g, name: g.name.trim() };
        if (clean.minAge === undefined) delete clean.minAge;
        if (clean.durationMin === undefined) delete clean.durationMin;
        if (!clean.notes?.trim()) delete clean.notes;
        if (!clean.featured) delete clean.featured;
        void onSave(clean);
      }}
    >
      <h1>{isNew ? 'משחק חדש' : 'עריכת משחק'}</h1>
      <label>
        שם המשחק
        <input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} required />
      </label>
      <div className="row">
        <label style={{ flex: 1 }}>
          שחקנים (מינימום)
          <input type="number" inputMode="numeric" min={1} value={g.minPlayers} onChange={(e) => setG({ ...g, minPlayers: Number(e.target.value) })} />
        </label>
        <label style={{ flex: 1 }}>
          שחקנים (מקסימום)
          <input type="number" inputMode="numeric" min={1} value={g.maxPlayers} onChange={(e) => setG({ ...g, maxPlayers: Number(e.target.value) })} />
        </label>
      </div>
      <div className="row">
        <label style={{ flex: 1 }}>
          גיל מינימלי / מומלץ
          <input type="number" inputMode="numeric" min={1} max={99} value={g.minAge ?? ''} placeholder="ריק = לא ידוע" onChange={(e) => setG({ ...g, minAge: num(e.target.value) })} />
        </label>
        <label style={{ flex: 1 }}>
          משך (דקות)
          <input type="number" inputMode="numeric" min={1} value={g.durationMin ?? ''} placeholder="אופציונלי" onChange={(e) => setG({ ...g, durationMin: num(e.target.value) })} />
        </label>
      </div>
      <div>
        <span className="label">סגנון</span>
        <div className="chips">
          {STYLES.map((s) => (
            <button key={s} type="button" className={`chip pick${g.styles.includes(s) ? ' on' : ''}`} aria-pressed={g.styles.includes(s)} onClick={() => setG({ ...g, styles: toggle(g.styles, s) })}>
              {STYLE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="label">רמת קושי</span>
        <div className="chips">
          {DIFFICULTIES.map((d) => (
            <button key={d} type="button" className={`chip pick${g.difficulty === d ? ' on' : ''}`} aria-pressed={g.difficulty === d} onClick={() => setG({ ...g, difficulty: d })}>
              {DIFF_DOT[d]} {DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
      </div>
      <label>
        הערות
        <textarea rows={2} value={g.notes ?? ''} onChange={(e) => setG({ ...g, notes: e.target.value })} placeholder="למשל: איך מלמדים, טיפים, חלקים חסרים" />
      </label>
      <label className="inline check">
        <input type="checkbox" checked={Boolean(g.featured)} onChange={(e) => setG({ ...g, featured: e.target.checked })} />
        ⭐ חובה להכיר (יופיע ראשון בהמלצות)
      </label>
      <div className="row">
        <button type="submit" className="primary" disabled={!valid}>
          שמור
        </button>
        <button type="button" onClick={onCancel}>
          ביטול
        </button>
        {!isNew && (
          <button type="button" className="danger" onClick={() => void onDelete()}>
            מחק
          </button>
        )}
      </div>
    </form>
  );
}
