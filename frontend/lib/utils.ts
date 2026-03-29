import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export const STATUS_CONFIG = {
  saturacion: {
    label: "Saturación",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-500/20",
    border: "border-red-200 dark:border-red-500/40",
    dot: "bg-red-500",
    badge: "bg-red-50 dark:bg-red-500/20 text-red-600 dark:text-red-300 border-red-200 dark:border-red-500/30",
  },
  elevado: {
    label: "Elevado",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-500/20",
    border: "border-orange-200 dark:border-orange-500/40",
    dot: "bg-orange-500",
    badge: "bg-orange-50 dark:bg-orange-500/20 text-orange-600 dark:text-orange-300 border-orange-200 dark:border-orange-500/30",
  },
  saludable: {
    label: "Saludable",
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-500/20",
    border: "border-green-200 dark:border-green-500/40",
    dot: "bg-green-500",
    badge: "bg-green-50 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30",
  },
  bajo: {
    label: "Bajo",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/20",
    border: "border-blue-200 dark:border-blue-500/40",
    dot: "bg-blue-500",
    badge: "bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30",
  },
  sobre_oferta: {
    label: "Sobre-oferta",
    color: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-500/20",
    border: "border-yellow-200 dark:border-yellow-500/40",
    dot: "bg-yellow-500",
    badge: "bg-yellow-50 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-500/30",
  },
  sin_datos: {
    label: "Sin datos",
    color: "text-[var(--txt-3)]",
    bg: "bg-[var(--surface-2)]",
    border: "border-[var(--border)]",
    dot: "bg-gray-400",
    badge: "bg-[var(--surface-2)] text-[var(--txt-3)] border-[var(--border)]",
  },
} as const;

export const RISK_CONFIG = {
  critico: {
    label: "CRÍTICO",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-500/20",
    border: "border-red-300 dark:border-red-500",
    badge: "bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30",
    icon: "🚨",
  },
  alto: {
    label: "ALTO",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-500/20",
    border: "border-orange-300 dark:border-orange-500",
    badge: "bg-orange-50 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30",
    icon: "🔴",
  },
  medio: {
    label: "MEDIO",
    color: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-500/20",
    border: "border-yellow-300 dark:border-yellow-500",
    badge: "bg-yellow-50 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-500/30",
    icon: "🟠",
  },
  bajo: {
    label: "BAJO",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/20",
    border: "border-blue-300 dark:border-blue-500",
    badge: "bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30",
    icon: "🟡",
  },
} as const;

export function formatRatio(ratio: number): string {
  return ratio.toFixed(2);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
