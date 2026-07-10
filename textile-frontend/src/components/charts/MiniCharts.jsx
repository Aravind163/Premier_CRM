// src/components/charts/MiniCharts.jsx
//
// Small, dependency-free SVG chart primitives used to give dashboard
// widgets a visual (not just numeric) read. Deliberately NOT using a
// charting library (recharts/chart.js/etc.) — these are a few hundred
// bytes of hand-drawn SVG each, so every page that uses them stays
// light instead of pulling in a large bundle for a handful of shapes.
//
// Components:
//   <DonutChart data={[{label, value, color}]} size={132} thickness={16} />
//   <BarChart   data={[{label, value, color}]} height={140} />
//   <MiniLegend data={[{label, value, color}]} />

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Donut / pie chart with a total in the middle. Pass thickness=radius for a full pie. */
export function DonutChart({ data, size = 132, thickness = 16, centerLabel, textColor = "#1a3d2b", subColor = "#4a7a5a" }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const r = size / 2;
  const cx = r, cy = r;
  const innerR = Math.max(0, r - thickness);

  let cursor = -90; // start at 12 o'clock
  const arcs = total === 0 ? [] : data
    .filter((d) => d.value > 0)
    .map((d) => {
      const sweep = (d.value / total) * 360;
      const start = cursor;
      const end = cursor + sweep;
      cursor = end;
      return { ...d, start, end };
    });

  const polar = (angleDeg, radius) => {
    const rad = (angleDeg * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  };

  const arcPath = (start, end, radius) => {
    const large = end - start > 180 ? 1 : 0;
    const [x1, y1] = polar(start, radius);
    const [x2, y2] = polar(end, radius);
    const [ix2, iy2] = polar(end, innerR);
    const [ix1, iy1] = polar(start, innerR);
    if (innerR <= 0) {
      return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
    }
    return [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${ix1} ${iy1}`,
      "Z",
    ].join(" ");
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={innerR > 0 ? (r + innerR) / 2 : r} fill="none" stroke="rgba(120,120,120,0.18)" strokeWidth={thickness} />
        ) : (
          arcs.map((a, i) => (
            <path key={i} d={arcPath(a.start, a.end, r)} fill={a.color} stroke="none">
              <title>{a.label}: {a.value}</title>
            </path>
          ))
        )}
        {innerR > 6 && (
          <text x={cx} y={cy - 3} textAnchor="middle" style={{ fontFamily: FONT, fontSize: size * 0.17, fontWeight: 700, fill: textColor }}>
            {centerLabel ?? total}
          </text>
        )}
        {innerR > 6 && centerLabel !== undefined && (
          <text x={cx} y={cy + size * 0.11} textAnchor="middle" style={{ fontFamily: FONT, fontSize: size * 0.075, fontWeight: 600, fill: subColor, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Total {total}
          </text>
        )}
      </svg>
      <MiniLegend data={data} textColor={textColor} subColor={subColor} />
    </div>
  );
}

/** Compact vertical bar chart. */
export function BarChart({ data, height = 140, barWidth = 28, gap = 14, textColor = "#1a3d2b", subColor = "#4a7a5a" }) {
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  const width = data.length * (barWidth + gap) + gap;
  const chartH = height - 28; // leave room for value + label

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMid meet" style={{ maxWidth: width }}>
      {data.map((d, i) => {
        const h = max === 0 ? 0 : (d.value / max) * chartH;
        const x = gap + i * (barWidth + gap);
        const y = chartH - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={Math.max(h, 2)} rx={5} fill={d.color} opacity={0.92}>
              <title>{d.label}: {d.value}</title>
            </rect>
            <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: textColor }}>
              {d.value}
            </text>
            <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 600, fill: subColor }}>
              {d.label.length > 9 ? d.label.slice(0, 8) + "…" : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Grouped bar chart — compares 2+ series per category (e.g. Requested vs Available). */
export function GroupedBarChart({ data, series, height = 150, groupWidth = 60, barGap = 3, groupGap = 20, textColor = "#1a3d2b", subColor = "#4a7a5a" }) {
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const barWidth = (groupWidth - barGap * (series.length - 1)) / series.length;
  const width = data.length * (groupWidth + groupGap) + groupGap;
  const chartH = height - 30;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMid meet" style={{ maxWidth: width }}>
        {data.map((d, gi) => {
          const gx = groupGap + gi * (groupWidth + groupGap);
          return (
            <g key={gi}>
              {d.values.map((v, si) => {
                const h = max === 0 ? 0 : (v / max) * chartH;
                const x = gx + si * (barWidth + barGap);
                const y = chartH - h;
                return (
                  <rect key={si} x={x} y={y} width={barWidth} height={Math.max(h, 2)} rx={4} fill={series[si].color} opacity={0.92}>
                    <title>{series[si].label}: {v}</title>
                  </rect>
                );
              })}
              <text x={gx + groupWidth / 2} y={height - 8} textAnchor="middle" style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 600, fill: subColor }}>
                {d.label.length > 9 ? d.label.slice(0, 8) + "…" : d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 14, marginTop: 4, flexWrap: "wrap" }}>
        {series.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />
            <span style={{ fontSize: 11.5, color: textColor, fontFamily: FONT, fontWeight: 600 }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Small color-key legend shared by the charts above. */
export function MiniLegend({ data, textColor = "#1a3d2b", subColor = "#4a7a5a" }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: FONT }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: textColor, fontWeight: 600 }}>{d.label}</span>
          <span style={{ fontSize: 11.5, color: subColor }}>
            {d.value}{total > 0 ? ` (${Math.round((d.value / total) * 100)}%)` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}