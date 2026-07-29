// src/utils/excelIO.js
//
// Shared Excel (.xlsx) download / upload helper for the Master pages.
// Every master list defines its own `columns` array — one entry per
// column shown in that page's table — and this file turns that into a
// downloadable workbook, or parses an uploaded workbook back into plain
// row objects keyed by each column's `key`.
//
// columns shape: [{ key: "name", header: "Customer Name" }, ...]
// The `header` is exactly what appears in the Excel column, so the
// exported file's columns always line up with what's on screen.

// xlsx-js-style is a SheetJS fork that actually writes cell styles (font,
// alignment, etc.) into the .xlsx file — the plain "xlsx" package silently
// drops them, which is why the banner below needs this instead.
import * as XLSX from "xlsx-js-style";



// Rows reserved above the actual header/data table for the title + date.
const TITLE_ROW = 0; // "Premier CRM (X Details)"
const DATE_ROW = 1; // "Date: DD-MM-YYYY"
const HEADER_ROW = 3; // one blank row separates the banner from the table

const TITLE_STYLE = {
  alignment: { horizontal: "center", vertical: "center" },
  font: { bold: true, sz: 14 },
};
const DATE_STYLE = {
  alignment: { horizontal: "center", vertical: "center" },
  font: { sz: 11, italic: true },
};
// Used by exportReportToExcel for "Summary", "By Status", table titles, etc.
const SECTION_STYLE = {
  font: { bold: true, sz: 12, color: { rgb: "1E4A45" } },
};
// Used by exportReportToExcel for the header row of any table/breakdown.
const HEADER_CELL_STYLE = {
  font: { bold: true, sz: 11 },
  fill: { fgColor: { rgb: "EAF3F1" } },
};

const MIN_COL_WIDTH = 10;
const MAX_COL_WIDTH = 45;
const COL_PADDING = 2;

function todayLabel() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** Width (in Excel "characters") a cell's value needs to display without wrapping. */
function widthOf(value) {
  return String(value ?? "").length;
}

/**
 * Compute one !cols entry per column, wide enough for the header and every
 * value in that column (clamped so a stray long value doesn't blow out the
 * whole sheet).
 */
function computeColumnWidths(rows, columns) {
  return columns.map(({ key, header }) => {
    let widest = widthOf(header);
    rows.forEach((row) => {
      widest = Math.max(widest, widthOf(row[key]));
    });
    const width = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, widest + COL_PADDING));
    return { wch: width };
  });
}

/**
 * Download `rows` (array of plain objects) as an .xlsx file.
 * `reportTitle` — e.g. "Product Details" — is shown in brackets after
 * "Premier CRM" in the banner row; omit it for a plain "Premier CRM" title.
 *
 * This is the "just the data table" export — still used by the Master
 * pages. For Reports pages that show stat cards / breakdown boxes above
 * their table, use exportReportToExcel below instead so the download
 * actually matches what's on screen.
 */
export function exportRowsToExcel(rows, columns, filename, reportTitle = "") {
  const lastCol = columns.length - 1;
  const titleText = reportTitle ? `Premier CRM (${reportTitle})` : "Premier CRM";

  // Banner: report title + today's date, each spanning the full table width.
  const aoa = [];
  aoa[TITLE_ROW] = [titleText];
  aoa[DATE_ROW] = [`Date: ${todayLabel()}`];
  aoa[HEADER_ROW] = columns.map((c) => c.header);

  rows.forEach((row, i) => {
    aoa[HEADER_ROW + 1 + i] = columns.map(({ key }) => row[key] ?? "");
  });

  // Even with zero rows, still produce a file with just the header row
  // so the user has a ready-to-fill template.
  if (rows.length === 0) {
    aoa[HEADER_ROW + 1] = columns.map(() => "");
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  // Merge the title/date rows across every column so they read as a banner
  // instead of being crammed into column A, and center them within it.
  worksheet["!merges"] = [
    { s: { r: TITLE_ROW, c: 0 }, e: { r: TITLE_ROW, c: lastCol } },
    { s: { r: DATE_ROW, c: 0 }, e: { r: DATE_ROW, c: lastCol } },
  ];
  worksheet[XLSX.utils.encode_cell({ r: TITLE_ROW, c: 0 })].s = TITLE_STYLE;
  worksheet[XLSX.utils.encode_cell({ r: DATE_ROW, c: 0 })].s = DATE_STYLE;

  // Auto-fit each column to its widest header/value so nothing is clipped
  // or left with a huge gap.
  worksheet["!cols"] = computeColumnWidths(rows, columns);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/**
 * Download a *full report* — stat cards, "label — count" breakdown boxes,
 * and one or more data tables — as a single .xlsx sheet, in that order,
 * top to bottom. This is what the Reports page's Export to Excel buttons
 * use, so the file matches everything visible on screen, not just the
 * underlying data rows.
 *
 * config:
 *   reportTitle: string                 e.g. "Enquiry Order Report"
 *   filename:    string                 without or with .xlsx
 *   stats:       [{ label, value }]     the top stat-card row, optional
 *   breakdowns:  [{ title, items: [{ label, value }] }]   the ListBox
 *                                        boxes, optional, any number
 *   tables:      [{ title, columns: [{key,header}], rows: [...] }]
 *                                        any number of data tables, optional
 */
export function exportReportToExcel({ reportTitle, filename, stats = [], breakdowns = [], tables = [] }) {
  const aoa = [];
  const merges = [];
  const styles = []; // { r, c, style }
  let r = 0;

  const setCell = (row, col, value, style) => {
    aoa[row] = aoa[row] || [];
    aoa[row][col] = value;
    if (style) styles.push({ r: row, c: col, style });
  };

  // Widest row anywhere in the sheet decides how many columns to size/merge.
  const maxTableCols = tables.reduce((m, t) => Math.max(m, t.columns?.length || 0), 0);
  const lastCol = Math.max(1, maxTableCols) - 1;

  const titleText = reportTitle ? `Premier CRM (${reportTitle})` : "Premier CRM";
  setCell(r, 0, titleText, TITLE_STYLE);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r++;
  setCell(r, 0, `Date: ${todayLabel()}`, DATE_STYLE);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r++;
  r++; // blank separator row

  if (stats.length) {
    setCell(r, 0, "Summary", SECTION_STYLE);
    r++;
    stats.forEach(({ label, value }) => {
      setCell(r, 0, label);
      setCell(r, 1, value);
      r++;
    });
    r++; // blank separator row
  }

  breakdowns.forEach(({ title, items = [] }) => {
    setCell(r, 0, title, SECTION_STYLE);
    r++;
    setCell(r, 0, "Label", HEADER_CELL_STYLE);
    setCell(r, 1, "Count", HEADER_CELL_STYLE);
    r++;
    if (items.length === 0) {
      setCell(r, 0, "No data yet.");
      r++;
    } else {
      items.forEach(({ label, value }) => {
        setCell(r, 0, label);
        setCell(r, 1, value);
        r++;
      });
    }
    r++; // blank separator row
  });

  tables.forEach(({ title, columns = [], rows = [] }) => {
    if (title) {
      setCell(r, 0, title, SECTION_STYLE);
      r++;
    }
    columns.forEach((c, ci) => setCell(r, ci, c.header, HEADER_CELL_STYLE));
    r++;
    if (rows.length === 0) {
      setCell(r, 0, "No data yet.");
      r++;
    } else {
      rows.forEach((row) => {
        columns.forEach(({ key }, ci) => setCell(r, ci, row[key] ?? ""));
        r++;
      });
    }
    r++; // blank separator row
  });

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet["!merges"] = merges;

  styles.forEach(({ r: row, c: col, style }) => {
    const addr = XLSX.utils.encode_cell({ r: row, c: col });
    if (!worksheet[addr]) worksheet[addr] = { t: "s", v: "" };
    worksheet[addr].s = style;
  });

  // Column widths: widest value seen in that column anywhere in the sheet.
  const colCount = Math.max(2, maxTableCols);
  const cols = [];
  for (let c = 0; c < colCount; c++) {
    let widest = MIN_COL_WIDTH;
    aoa.forEach((row) => {
      if (row && row[c] != null) widest = Math.max(widest, widthOf(row[c]));
    });
    cols.push({ wch: Math.min(MAX_COL_WIDTH, widest + COL_PADDING) });
  }
  worksheet["!cols"] = cols;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/**
 * Read an uploaded .xlsx/.xls/.csv File and return an array of plain
 * objects keyed by each column's `key` (matched against the sheet's
 * header row by `header`, case-insensitively, ignoring extra spaces).
 */
export function importRowsFromExcel(file, columns) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const norm = (s) => String(s).trim().toLowerCase();
        const headerToKey = {};
        columns.forEach(({ key, header }) => { headerToKey[norm(header)] = key; });

        // Scan the first few rows for the one that actually contains the
        // expected column headers, so files with a title/date banner above
        // the table (e.g. ones downloaded from this app) still import fine.
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true });
        const headerRowIndexInGrid = grid.findIndex((r) =>
          r.some((cell) => headerToKey[norm(cell)])
        );
        const headerRow = headerRowIndexInGrid === -1 ? 0 : headerRowIndexInGrid;

        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", range: headerRow });

        const rows = raw.map((r) => {
          const out = {};
          Object.keys(r).forEach((h) => {
            const key = headerToKey[norm(h)];
            if (key) out[key] = typeof r[h] === "string" ? r[h].trim() : r[h];
          });
          return out;
        }).filter((r) => Object.values(r).some((v) => v !== "" && v !== undefined && v !== null));

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}