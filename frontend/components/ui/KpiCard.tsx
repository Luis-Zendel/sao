import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  color?: "red" | "orange" | "green" | "blue" | "yellow" | "gray";
  icon?: React.ReactNode;
}

const colorMap = {
  red:    { value: "text-red-500",    bg: "bg-red-50 dark:bg-red-500/10",    border: "border-red-200 dark:border-red-500/20"    },
  orange: { value: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-500/10", border: "border-orange-200 dark:border-orange-500/20" },
  green:  { value: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-500/10", border: "border-green-200 dark:border-green-500/20" },
  blue:   { value: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-500/10",   border: "border-blue-200 dark:border-blue-500/20"   },
  yellow: { value: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/20" },
  gray:   { value: "text-[var(--txt-2)]", bg: "bg-[var(--surface-2)]", border: "border-[var(--border)]" },
};

export function KpiCard({ label, value, sublabel, color = "gray", icon }: KpiCardProps) {
  const c = colorMap[color];
  return (
    <div className={cn("rounded-xl border p-4 flex flex-col gap-2 shadow-sm", c.bg, c.border)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--txt-2)] uppercase tracking-wide">{label}</p>
        {icon && <div className={cn("text-sm", c.value)}>{icon}</div>}
      </div>
      <p className={cn("text-3xl font-bold tabular-nums", c.value)}>{value}</p>
      {sublabel && <p className="text-xs text-[var(--txt-3)]">{sublabel}</p>}
    </div>
  );
}
