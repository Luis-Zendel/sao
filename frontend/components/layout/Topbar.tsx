"use client";

import { useEffect, useState } from "react";
import { Activity, Wifi, WifiOff } from "lucide-react";
import { getAgentStatus, type AgentStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props { title: string; subtitle?: string }

export default function Topbar({ title, subtitle }: Props) {
  const [status, setStatus]   = useState<AgentStatus | null>(null);
  const [online, setOnline]   = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try   { setStatus(await getAgentStatus()); setOnline(true); }
      catch { setOnline(false); }
    };
    fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-14 px-6 border-b border-[var(--border)] flex items-center justify-between
      bg-[var(--surface)]/80 backdrop-blur-sm sticky top-0 z-10 transition-colors">
      <div>
        <h1 className="text-base font-semibold text-[var(--txt)] leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-[var(--txt-3)] leading-tight">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2.5">
        {status && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full
            bg-[var(--surface-2)] border border-[var(--border)]">
            <Activity size={11} className={cn(status.running ? "text-green-500" : "text-[var(--txt-3)]")} />
            <span className="text-xs text-[var(--txt-2)]">
              Agente {status.running ? "activo" : "inactivo"}
            </span>
          </div>
        )}

        <div className={cn(
          "flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs",
          online
            ? "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20 text-green-600 dark:text-green-400"
            : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400"
        )}>
          {online ? <Wifi size={11} /> : <WifiOff size={11} />}
          <span>{online ? "API conectada" : "Sin conexión"}</span>
        </div>
      </div>
    </header>
  );
}
