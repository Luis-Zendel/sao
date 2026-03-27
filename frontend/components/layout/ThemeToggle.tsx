"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-8 h-8" />;

  const dark = theme === "dark";
  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors
        bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)]
        text-[var(--txt-2)] hover:text-[var(--txt)]"
      title={dark ? "Modo día" : "Modo noche"}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
