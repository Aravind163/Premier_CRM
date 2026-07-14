// src/components/charts/MiniCharts.jsx
//
// Small, dependency-free SVG chart primitives used to give dashboard
// widgets a visual (not just numeric) read. Deliberately NOT using a
// charting library (recharts/chart.js/etc.) — these are a few hundred
// bytes of hand-drawn SVG each, so every page that uses them stays
// light instead of pulling in a large bundle for a handful of shapes.
//
// All charts below show a real floating tooltip on hover (positioned off
// the actual hovered shape's screen position, not the browser's native
// <title> tooltip), matching the interactive feel of a Recharts-based
// dashboard.
//
// Components:
//   <DonutChart data={[{label, value, color}]} size={132} thickness={16} />
//   <BarChart   data={[{label, value, color}]} height={140} showAxis />
//   <AreaChart  data={[{label, value}]} height={180} color="#2E7A72" />
//   <MiniLegend data={[{label, value, color}]} />

import { useRef, useState } from "react";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Nicely-rounded axis ticks — 0..niceMax in ~4-5 steps. */
function niceAxisTicks(maxVal) {
  const max = Math.max(1, maxVal);
  const rawStep = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { ticks, top: top || 1 };
}

/** Floating tooltip, positioned against the hovered shape's own screen rect. */
function ChartTooltip({ hover, textColor, subColor }) {
  if (!hover) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: hover.x,
        top: hover.y,
        transform: "translate(-50%, -100%) translateY(-10px)",
        pointerEvents: "none",
        background: "#fff",
        border: "1px solid #DBE3EC",
        borderRadius: 8,
        padding: "6px 10px",
        boxShadow: "0 10px 24px -8px rgba(15,33,56,0.30)",
        fontFamily: FONT,
        fontSize: 12,
        fontWeight: 600,
        color: textColor || "#0F2138",
        whiteSpace: "nowrap",
        zIndex: 20,
      }}
    >
      <span>{hover.label}</span>
      <span style={{ color: subColor || "#526073", fontWeight: 500 }}> : {hover.value}</span>
    </div>
  );
}

/** Reads the hovered element's own bounding box relative to the chart's wrapper container. */
function relativeCenter(containerEl, targetEl, anchor = "top") {
  if (!containerEl || !targetEl || typeof containerEl.getBoundingClientRect !== "function") return null;
  const cr = containerEl.getBoundingClientRect();
  const tr = targetEl.getBoundingClientRect();
  const x = tr.left + tr.width / 2 - cr.left;
  const y = anchor === "top" ? tr.top - cr.top : tr.top + tr.height / 2 - cr.top;
  return { x, y };
}

/** Donut / pie chart with a total in the middle. Pass thickness=radius for a full pie. */
export function DonutChart({ data, size = 132, thickness = 16, centerLabel, textColor = "#0F2138", subColor = "#526073", valueFormatter }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const r = size / 2;
  const cx = r, cy = r;
  const innerR = Math.max(0, r - thickness);
  const containerRef = useRef(null);
  const [hover, setHover] = useState(null);
  const fmt = valueFormatter || ((v) => v);

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
      <div ref={containerRef} style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={innerR > 0 ? (r + innerR) / 2 : r} fill="none" stroke="rgba(120,120,120,0.18)" strokeWidth={thickness} />
          ) : (
            arcs.map((a, i) => (
              <path
                key={i}
                d={arcPath(a.start, a.end, r)}
                fill={a.color}
                stroke={hover?.i === i ? "#fff" : "none"}
                strokeWidth={hover?.i === i ? 1.5 : 0}
                style={{ cursor: "pointer", filter: hover && hover.i !== i ? "opacity(0.55)" : "none", transition: "filter 0.12s" }}
                onMouseEnter={(e) => { const pos = relativeCenter(containerRef.current, e.currentTarget, "top"); if (pos) setHover({ i, label: a.label, value: fmt(a.value), ...pos }); }}
                onMouseMove={(e) => { const pos = relativeCenter(containerRef.current, e.currentTarget, "top"); if (pos) setHover((h) => (h ? { ...h, ...pos } : h)); }}
                onMouseLeave={() => setHover(null)}
              />
            ))
          )}
          {innerR > 6 && (
            <text x={cx} y={cy - 3} textAnchor="middle" style={{ fontFamily: FONT, fontSize: size * 0.17, fontWeight: 700, fill: textColor, pointerEvents: "none" }}>
              {centerLabel ?? total}
            </text>
          )}
          {innerR > 6 && centerLabel !== undefined && (
            <text x={cx} y={cy + size * 0.11} textAnchor="middle" style={{ fontFamily: FONT, fontSize: size * 0.075, fontWeight: 600, fill: subColor, textTransform: "uppercase", letterSpacing: "0.04em", pointerEvents: "none" }}>
              Total {total}
            </text>
          )}
        </svg>
        <ChartTooltip hover={hover} textColor={textColor} subColor={subColor} />
      </div>
      <MiniLegend data={data} textColor={textColor} subColor={subColor} valueFormatter={fmt} />
    </div>
  );
}

/** Compact vertical bar chart. Pass showAxis for gridlines + Y-axis numbers (matches the dashboard's "Enquiry Status Breakdown" look). */
export function BarChart({ data, height = 140, barWidth = 28, gap = 14, textColor = "#0F2138", subColor = "#526073", gridColor = "#DBE3EC", showAxis = false, valueFormatter }) {
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  const containerRef = useRef(null);
  const [hover, setHover] = useState(null);
  const fmt = valueFormatter || ((v) => v);

  const barHandlers = (i, d) => ({
    style: { cursor: "pointer" },
    onMouseEnter: (e) => { const pos = relativeCenter(containerRef.current, e.currentTarget, "top"); if (pos) setHover({ i, label: d.label, value: fmt(d.value), ...pos }); },
    onMouseMove: (e) => { const pos = relativeCenter(containerRef.current, e.currentTarget, "top"); if (pos) setHover((h) => (h ? { ...h, ...pos } : h)); },
    onMouseLeave: () => setHover(null),
  });

  if (!showAxis) {
    const width = data.length * (barWidth + gap) + gap;
    const chartH = height - 28;
    return (
      <div ref={containerRef} style={{ position: "relative", maxWidth: width, width: "100%" }}>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMid meet" style={{ maxWidth: width }}>
          {data.map((d, i) => {
            const h = max === 0 ? 0 : (d.value / max) * chartH;
            const x = gap + i * (barWidth + gap);
            const y = chartH - h;
            return (
              <g key={i}>
                <rect x={x} y={y} width={barWidth} height={Math.max(h, 2)} rx={5} fill={d.color} opacity={hover && hover.i !== i ? 0.6 : 0.95} {...barHandlers(i, d)} />
                <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: textColor, pointerEvents: "none" }}>
                  {d.value}
                </text>
                <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 600, fill: subColor, pointerEvents: "none" }}>
                  {d.label.length > 9 ? d.label.slice(0, 8) + "…" : d.label}
                </text>
              </g>
            );
          })}
        </svg>
        <ChartTooltip hover={hover} textColor={textColor} subColor={subColor} />
      </div>
    );
  }

  // ── Axis mode: Y-axis numbers + dashed gridlines, like a proper chart ──
  const { ticks, top } = niceAxisTicks(max);
  const padLeft = 26, padBottom = 22, padTop = 10;
  const plotW = data.length * (barWidth + gap) + gap;
  const width = plotW + padLeft;
  const chartH = height - padBottom - padTop;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMid meet">
        {ticks.map((tv, i) => {
          const y = padTop + chartH - (tv / top) * chartH;
          return (
            <g key={i}>
              <line x1={padLeft} x2={width} y1={y} y2={y} stroke={gridColor} strokeDasharray="3 3" strokeWidth={1} />
              <text x={padLeft - 8} y={y + 3} textAnchor="end" style={{ fontFamily: FONT, fontSize: 10, fill: subColor }}>{tv}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (Math.max(0, d.value) / top) * chartH;
          const x = padLeft + gap + i * (barWidth + gap);
          const y = padTop + chartH - h;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barWidth} height={Math.max(h, 1)} rx={6} fill={d.color} opacity={hover && hover.i !== i ? 0.6 : 0.98} {...barHandlers(i, d)} />
              <text x={x + barWidth / 2} y={padTop + chartH + 16} textAnchor="middle" style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 600, fill: subColor, pointerEvents: "none" }}>
                {d.label.length > 10 ? d.label.slice(0, 9) + "…" : d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ChartTooltip hover={hover} textColor={textColor} subColor={subColor} />
    </div>
  );
}

/**
 * Smooth filled area/line chart — e.g. a 7-day trend.
 * data: [{label, value}]
 */
export function AreaChart({ data, height = 180, color = "#2E7A72", textColor = "#0F2138", subColor = "#526073", gridColor = "#DBE3EC", gradientId, valueFormatter }) {
  const gid = gradientId || `areaGrad-${Math.random().toString(36).slice(2, 9)}`;
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  const { ticks, top } = niceAxisTicks(max);
  const padLeft = 26, padBottom = 22, padTop = 12, padRight = 10;
  const width = 360;
  const plotW = width - padLeft - padRight;
  const chartH = height - padBottom - padTop;
  const n = Math.max(1, data.length - 1);
  const containerRef = useRef(null);
  const [hover, setHover] = useState(null);
  const fmt = valueFormatter || ((v) => v);

  const pt = (i, v) => {
    const x = padLeft + (i / n) * plotW;
    const y = padTop + chartH - (Math.max(0, v) / top) * chartH;
    return [x, y];
  };

  const pts = data.map((d, i) => pt(i, d.value || 0));

  // Catmull-Rom -> cubic bezier smoothing for a soft curve like the reference.
  const smoothPath = (points) => {
    if (points.length < 2) return "";
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  };

  const linePath = smoothPath(pts);
  const areaPath = pts.length > 1
    ? `${linePath} L ${pts[pts.length - 1][0]} ${padTop + chartH} L ${pts[0][0]} ${padTop + chartH} Z`
    : "";

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMid meet">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {ticks.map((tv, i) => {
          const y = padTop + chartH - (tv / top) * chartH;
          return (
            <g key={i}>
              <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke={gridColor} strokeDasharray="3 3" strokeWidth={1} />
              <text x={padLeft - 8} y={y + 3} textAnchor="end" style={{ fontFamily: FONT, fontSize: 10, fill: subColor }}>{tv}</text>
            </g>
          );
        })}
        {areaPath && <path d={areaPath} fill={`url(#${gid})`} stroke="none" />}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />}
        {pts.map(([x, y], i) => (
          <circle
            key={i} cx={x} cy={y} r={hover?.i === i ? 5 : 3.2} fill={color}
            stroke="#fff" strokeWidth={hover?.i === i ? 2 : 0}
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) => { const pos = relativeCenter(containerRef.current, e.currentTarget, "top"); if (pos) setHover({ i, label: data[i].label, value: fmt(data[i].value), ...pos }); }}
            onMouseMove={(e) => { const pos = relativeCenter(containerRef.current, e.currentTarget, "top"); if (pos) setHover((h) => (h ? { ...h, ...pos } : h)); }}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {data.map((d, i) => {
          const [x] = pt(i, d.value || 0);
          return (
            <text key={i} x={x} y={height - 4} textAnchor="middle" style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 600, fill: subColor, pointerEvents: "none" }}>
              {d.label}
            </text>
          );
        })}
      </svg>
      <ChartTooltip hover={hover} textColor={textColor} subColor={subColor} />
    </div>
  );
}

/** Grouped bar chart — compares 2+ series per category (e.g. Requested vs Available). */
export function GroupedBarChart({ data, series, height = 150, groupWidth = 60, barGap = 3, groupGap = 20, textColor = "#0F2138", subColor = "#526073", valueFormatter }) {
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const barWidth = (groupWidth - barGap * (series.length - 1)) / series.length;
  const width = data.length * (groupWidth + groupGap) + groupGap;
  const chartH = height - 30;
  const containerRef = useRef(null);
  const [hover, setHover] = useState(null);
  const fmt = valueFormatter || ((v) => v);

  return (
    <div>
      <div ref={containerRef} style={{ position: "relative", maxWidth: width, width: "100%" }}>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMid meet" style={{ maxWidth: width }}>
          {data.map((d, gi) => {
            const gx = groupGap + gi * (groupWidth + groupGap);
            return (
              <g key={gi}>
                {d.values.map((v, si) => {
                  const h = max === 0 ? 0 : (v / max) * chartH;
                  const x = gx + si * (barWidth + barGap);
                  const y = chartH - h;
                  const key = `${gi}-${si}`;
                  return (
                    <rect
                      key={si} x={x} y={y} width={barWidth} height={Math.max(h, 2)} rx={4}
                      fill={series[si].color} opacity={hover && hover.key !== key ? 0.6 : 0.95}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => { const pos = relativeCenter(containerRef.current, e.currentTarget, "top"); if (pos) setHover({ key, label: `${d.label} · ${series[si].label}`, value: fmt(v), ...pos }); }}
                      onMouseMove={(e) => { const pos = relativeCenter(containerRef.current, e.currentTarget, "top"); if (pos) setHover((h2) => (h2 ? { ...h2, ...pos } : h2)); }}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
                <text x={gx + groupWidth / 2} y={height - 8} textAnchor="middle" style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 600, fill: subColor, pointerEvents: "none" }}>
                  {d.label.length > 9 ? d.label.slice(0, 8) + "…" : d.label}
                </text>
              </g>
            );
          })}
        </svg>
        <ChartTooltip hover={hover} textColor={textColor} subColor={subColor} />
      </div>
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

/** Small color-key legend shared by the charts above. Hovering a row also highlights nothing on its own — pass the same data driving the chart above it for consistent colors. */
export function MiniLegend({ data, textColor = "#0F2138", subColor = "#526073", valueFormatter }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const fmt = valueFormatter || ((v) => v);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: FONT }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: textColor, fontWeight: 600 }}>{d.label}</span>
          <span style={{ fontSize: 11.5, color: subColor }}>
            {fmt(d.value)}{total > 0 ? ` (${Math.round((d.value / total) * 100)}%)` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}