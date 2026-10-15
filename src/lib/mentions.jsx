import React from 'react';

// @mentions — type @Name in any prompt to pull a saved character, location or product
// (its description + reference images) into the generation. Higgsfield-style asset tagging.
const slug = (s) => String(s || '').trim().replace(/\s+/g, '_');

export function allEntities(db) {
  return [
    ...(db.characters || []).map((e) => ({ ...e, type: 'character', icon: e.kind === 'influencer' ? '🌟' : '☺' })),
    ...(db.locations || []).map((e) => ({ ...e, type: 'location', icon: '⌖' })),
    ...(db.products || []).map((e) => ({ ...e, type: 'product', icon: '📦' })),
  ];
}

export function resolveMentions(text, db) {
  const t = String(text || '');
  if (!t.includes('@')) return [];
  const lower = t.toLowerCase();
  return allEntities(db)
    .filter((e) => e.name && (lower.includes('@' + slug(e.name).toLowerCase()) || lower.includes('@' + e.name.toLowerCase())))
    .map((e) => ({ type: e.type, id: e.id, name: e.name, description: e.description || '', refs: e.refs || [], signatureColor: e.signatureColor || '', soulId: e.soulId || null }));
}

export function MentionBar({ db, value, onInsert }) {
  const ents = allEntities(db);
  const found = resolveMentions(value, db);
  if (ents.length === 0) {
    return <p className="sub" style={{ fontSize: 11, margin: '4px 0 0' }}>Tip: save characters, locations or products, then type <code>@Name</code> in a prompt to pull them in.</p>;
  }
  return (
    <div className="mention-bar">
      <span className="sub" style={{ fontSize: 11 }}>Tag a saved asset:</span>
      {ents.slice(0, 24).map((e) => {
        const on = found.some((f) => f.id === e.id);
        return (
          <button key={e.type + e.id} className={'chip mini' + (on ? ' on' : '')} title={e.description}
            onClick={() => { if (!on) onInsert('@' + slug(e.name)); }}>
            {e.icon} @{slug(e.name)}
          </button>
        );
      })}
      {found.length > 0 && <span className="ok" style={{ margin: 0, fontSize: 11 }}>✓ {found.length} asset{found.length > 1 ? 's' : ''} + their reference images attached</span>}
    </div>
  );
}

export const insertMention = (prev, tag) => (prev && !/\s$/.test(prev) ? prev + ' ' : prev || '') + tag + ' ';
