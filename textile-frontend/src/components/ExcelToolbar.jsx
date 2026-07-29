// src/components/ExcelToolbar.jsx
//
// Drop-in "⬇ Download Excel / ⬆ Upload Excel" button pair for a master
// list page. Column headers in the downloaded file — and expected in
// an uploaded file — always match `columns`, which each page passes in
// aligned with what that page's table actually shows.
import { useRef, useState } from "react";
import { exportRowsToExcel, importRowsFromExcel } from "../utils/excelIO";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export default function ExcelToolbar({ themeG, rows, columns, filename, reportTitle, onImportRows }) {
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'success'|'error', text }

  const btnStyle = {
    display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9,
    border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain,
    cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 600,
  };

  const handleDownload = () => {
    exportRowsToExcel(rows, columns, filename, reportTitle);
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setImporting(true);
    setNotice(null);
    try {
      const parsedRows = await importRowsFromExcel(file, columns);
      if (parsedRows.length === 0) {
        setNotice({ type: "error", text: "No rows found in that file." });
        return;
      }
      const result = await onImportRows(parsedRows);
      const created = result?.created ?? parsedRows.length;
      const failed = result?.failed ?? 0;
      setNotice({
        type: failed > 0 ? "error" : "success",
        text: failed > 0
          ? `Imported ${created} row(s), ${failed} failed. Check required columns and try again for the failed rows.`
          : `Imported ${created} row(s) successfully.`,
      });
    } catch (err) {
      setNotice({ type: "error", text: err.message || "Failed to read that file." });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={btnStyle} onClick={handleDownload} title="Download the current list as an Excel file">
          ⬇ Download Excel
        </button>
        <button type="button" style={{ ...btnStyle, opacity: importing ? 0.6 : 1 }} onClick={handleUploadClick} disabled={importing} title="Upload an Excel file to bulk-add rows">
          {importing ? "Uploading…" : "⬆ Upload Excel"}
        </button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFileChange} />
      </div>
      {notice && (
        <span style={{ fontSize: 12, fontFamily: FONT, color: notice.type === "error" ? "#B23A3A" : "#1F5C99" }}>
          {notice.text}
        </span>
      )}
    </div>
  );
}