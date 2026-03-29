"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart3, BellRing, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/",           icon: LayoutDashboard, label: "Dashboard",        sublabel: "Operación en vivo" },
  { href: "/diagnostico",icon: BarChart3,        label: "Diagnóstico",      sublabel: "Análisis histórico" },
  { href: "/alertas",    icon: BellRing,         label: "Motor de Alertas", sublabel: "Módulo 2" },
  { href: "/agente",     icon: Bot,              label: "Agente AI",        sublabel: "Módulo 3 · Telegram" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 min-h-screen flex flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-colors">
      {/* Logo */}
      <div className="p-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#FF441F] flex items-center justify-center text-white font-bold text-sm shadow-sm">
            R
          </div>
          <div>
            <p className="font-semibold text-[var(--txt)] text-sm leading-tight">Rappi Ops</p>
            <p className="text-[10px] text-[var(--txt-3)] leading-tight">Monterrey · Alertas AI</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group",
                active
                  ? "bg-orange-50 dark:bg-[#FF441F]/15 text-[#FF441F]"
                  : "text-[var(--txt-2)] hover:bg-[var(--surface-2)] hover:text-[var(--txt)]"
              )}
            >
              <item.icon
                size={16}
                className={cn(
                  "shrink-0 transition-colors",
                  active ? "text-[#FF441F]" : "text-[var(--txt-3)] group-hover:text-[var(--txt-2)]"
                )}
              />
              <div className="min-w-0">
                <p className={cn("text-sm font-medium leading-tight", active ? "text-[#FF441F]" : "")}>
                  {item.label}
                </p>
                <p className="text-[10px] text-[var(--txt-3)] leading-tight">{item.sublabel}</p>
              </div>
              {active && <div className="ml-auto w-1 h-4 rounded-full bg-[#FF441F]" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer + Theme toggle */}
      <div className="p-4 border-t border-[var(--border)] flex items-center justify-between">
        <p className="text-[10px] text-[var(--txt-3)]">Open-Meteo · Gemini</p>
        <ThemeToggle />
      </div>
    </aside>
  );
}
