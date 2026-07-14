import { createContext, useContext, useState, useEffect } from "react";

const light = {
  primary: '#1F5C99',
  secondary: '#2E7A72',
  background: '#F5F7FA',
  surface: '#EAEFF5',
  card: '#FFFFFF',
  border: '#DBE3EC',
  text: '#164672',
  textPrimary: '#0F2138',
  textSecondary: '#101B28',
  textPlaceholder: '#526073',
  success: '#2E7A72',
  error: '#B23A3A',
  warning: '#D69426',
  info: '#3A5C8C',
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  // Sidebar & header
  sidebarBg: '#0F2138',
  headerBg: '#1F5C99',
  sidebarText: 'rgba(255,255,255,0.75)',
  sidebarActive: '#1F5C99',
  accentLight: '#5B9BD9',
  tableRowBg: '#FFFFFF',
  tableAltBg: '#F5F7FA',
  inputBg: '#FFFFFF',
  inputBorder: '#DBE3EC',
};

const dark = {
  primary: '#1F5C99',
  secondary: '#164672',
  background: '#081422',
  surface: '#16324F',
  card: '#0F2138',
  border: '#1F3A5C',
  text: '#164672',
  textPrimary: '#F5F7FA',
  textSecondary: '#8C96A3',
  textPlaceholder: '#526073',
  success: '#5B9BD9',
  error: '#D97C7C',
  warning: '#EEC15E',
  info: '#5B9BD9',
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  // Sidebar & header
  sidebarBg: '#081422',
  headerBg: '#081422',
  sidebarText: 'rgba(255,255,255,0.65)',
  sidebarActive: '#1F5C99',
  accentLight: '#5B9BD9',
  tableRowBg: '#0F2138',
  tableAltBg: '#16324F',
  inputBg: '#16324F',
  inputBorder: '#1F3A5C',
};

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem("premier_theme") === "dark";
  });

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      localStorage.setItem("premier_theme", next ? "dark" : "light");
      return next;
    });
  };

  const colors = isDark ? dark : light;

  useEffect(() => {
    document.body.style.background = colors.background;
  }, [isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
