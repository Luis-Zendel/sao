import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
}

export function Button({
  children, className, variant = "primary", size = "md", loading, disabled, ...props
}: ButtonProps) {
  const variants = {
    primary:   "bg-[#FF441F] hover:bg-[#e03a18] text-white border-transparent shadow-sm",
    secondary: "bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--txt)] border-[var(--border)]",
    danger:    "bg-red-50 dark:bg-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/30 text-red-600 dark:text-red-300 border-red-200 dark:border-red-500/30",
    ghost:     "bg-transparent hover:bg-[var(--surface-2)] text-[var(--txt-2)] border-transparent",
  };
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm" };

  return (
    <button
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border font-medium transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant], sizes[size], className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
