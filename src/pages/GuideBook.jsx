import React from 'react';
import guides from '../../data/guideBook.json';

// GuideBook modal — shows how-to content for a section
// Usage: <GuideBook sectionId="fashion" onClose={() => setShowGuide(false)} />
export default function GuideBook({ sectionId, onClose }) {
  const guide = guides.sections[sectionId];
  if (!guide) return null;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div
        className="card modal"
        style={{ width: 700, maxWidth: '95vw', maxHeight: '88vh', overflow: 'auto', padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'Orbitron, sans-serif', letterSpacing: 2, color: 'var(--accent)', textTransform: 'uppercase' }}>
              {guide.icon} {guide.title}
            </div>
            <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--muted)', textTransform: 'uppercase', marginTop: 2 }}>
              GUIDE BOOK
            </div>
          </div>
          <button
            className="btn ghost small"
            onClick={onClose}
            style={{ marginLeft: 16, flexShrink: 0 }}
          >
            ✕ Close
          </button>
        </div>

        {/* Intro */}
        <p style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.65, marginBottom: 22, borderLeft: '3px solid rgba(139,107,255,.35)', paddingLeft: 14 }}>
          {guide.intro}
        </p>

        {/* Steps */}
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>How to use this section</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {guide.steps.map((step, i) => (
            <div key={i} style={{ background: 'rgba(139,107,255,.04)', border: '1px solid rgba(139,107,255,.11)', borderRadius: 8, padding: '11px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: .5 }}>
                {step.title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                {step.body}
              </div>
            </div>
          ))}
        </div>

        {/* Tips */}
        <h3 style={{ marginBottom: 10 }}>Pro tips</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 22 }}>
          {guide.tips.map((tip, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
              <span style={{ color: 'var(--accent)', fontSize: 16, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>◆</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>

        {/* API Keys */}
        {guide.apiKeys && guide.apiKeys.length > 0 && (
          <>
            <h3 style={{ marginBottom: 10 }}>API keys you'll need</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {guide.apiKeys.map((key, i) => (
                <span key={i} className="badge" style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 6, background: 'rgba(139,107,255,.08)', color: 'var(--accent)', border: '1px solid rgba(139,107,255,.25)' }}>
                  {key}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
              Add keys in <strong style={{ color: 'var(--text)' }}>Settings → API Keys</strong>. Keys are stored encrypted on your machine only.
            </p>
          </>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid rgba(139,107,255,.12)', marginTop: 20, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: .5 }}>GOD'S PANDORA · Guide Book</span>
          <button className="btn ghost small" onClick={onClose}>Close Guide</button>
        </div>
      </div>
    </div>
  );
}
