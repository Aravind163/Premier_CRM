import { useTheme } from "../ThemeContext";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export default function Footer() {
  const { colors, isDark } = useTheme();

  return (
    <div style={{
      background: isDark ? colors.sidebarBg : "#0F2138",
      borderTop: `1px solid ${isDark ? colors.border : '#173456'}`,
      padding: "14px 0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      fontFamily: FONT,
    }}>
      <span style={{ fontSize: 12, color: "rgb(245, 241, 241)", letterSpacing: "0.03em", fontFamily: FONT }}>
        &copy; 2026 Design &amp; Developed by{" "}
        <a href="https://scoto.in" target="_blank" rel="noopener noreferrer" style={{ color: "#5B9BD9", textDecoration: "none", fontWeight: 600 }}>
          Scoto Systec Pvt Ltd Scoto.in
        </a>
      </span>
    </div>
  );
}
