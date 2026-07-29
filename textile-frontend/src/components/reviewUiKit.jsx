// src/components/reviewUiKit.jsx
//
// Small shared UI pieces ported from CottonMass_fixed's src/components/ui.jsx,
// trimmed to just what the Complaints & Claims page needs. Kept dependency-free
// (no framer-motion) — everything else (fonts, colors, .card/.tag/.btn/.field
// classes) already exists in this project's own index.css.
import React from "react";

export function StatCardV2({ icon: Icon, label, value, accent = "#1F5C99" }) {
  return (
    <div className="stat-v2">
      <div className="stat-v2-icon" style={{ background: `${accent}1E` }}>
        <Icon size={19} color={accent} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="stat-v2-label">{label}</div>
        <div className="stat-v2-value" style={{ color: accent }}>{value}</div>
      </div>
    </div>
  );
}

export function SectionTitle({ eyebrow, title, desc, action }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
      <div>
        {eyebrow && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-4 h-[2px] rounded-full bg-moss" />
            <span className="text-moss text-xs font-bold uppercase tracking-widest">{eyebrow}</span>
          </div>
        )}
        <h2 className="font-display text-xl font-bold text-pine">{title}</h2>
        {desc && <p className="text-sm text-slate mt-1 max-w-2xl">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate">
      {Icon && <Icon size={22} className="opacity-40" />}
      <span className="text-sm">{text}</span>
    </div>
  );
}