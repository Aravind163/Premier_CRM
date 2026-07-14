import { useState } from "react";

/**
 * MultiSelect — checkbox-chip picker for assigning MULTIPLE areas
 * (Districts or Taluks) to an Admin / End User.
 *
 * value:    string[]  (selected items)
 * options:  string[]  (all available items to pick from)
 * onChange: (string[]) => void
 */
export default function MultiSelect({ value = [], options = [], onChange, placeholder = "Search…", emptyText = "No options available." }) {
  const [query, setQuery] = useState("");

  const toggle = (opt) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  const remove = (opt) => onChange(value.filter((v) => v !== opt));

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {value.map((v) => (
            <span key={v} style={chip}>
              {v}
              <button type="button" onClick={() => remove(v)} style={chipX} aria-label={`Remove ${v}`}>×</button>
            </span>
          ))}
        </div>
      )}

      {options.length > 6 && (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          style={searchInput}
        />
      )}

      <div style={listBox}>
        {filtered.length === 0 ? (
          <div style={{ padding: "10px 12px", fontSize: 12.5, color: "#8C96A3" }}>{emptyText}</div>
        ) : (
          filtered.map((opt) => (
            <label key={opt} style={optRow}>
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
                style={{ marginRight: 9, accentColor: "#1F5C99" }}
              />
              <span style={{ fontSize: 13 }}>{opt}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

const chip = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "rgba(46,122,114,0.13)", color: "#101B28",
  border: "1px solid rgba(46,122,114,0.3)", borderRadius: 16,
  padding: "4px 6px 4px 12px", fontSize: 12, fontWeight: 600,
};
const chipX = {
  background: "transparent", border: "none", cursor: "pointer",
  color: "#101B28", fontSize: 15, lineHeight: 1, padding: "0 4px",
  fontFamily: "inherit",
};
const searchInput = {
  width: "100%", boxSizing: "border-box", background: "#F5F7FA",
  border: "1px solid rgba(46,122,114,0.22)", borderRadius: 8,
  padding: "7px 11px", fontSize: 12.5, color: "#0F2138",
  fontFamily: "inherit", outline: "none", marginBottom: 6,
};
const listBox = {
  maxHeight: 160, overflowY: "auto", border: "1px solid rgba(46,122,114,0.18)",
  borderRadius: 8, background: "#fff",
};
const optRow = {
  display: "flex", alignItems: "center", padding: "8px 12px", cursor: "pointer",
  borderBottom: "1px solid rgba(46,122,114,0.06)", color: "#0F2138",
};
