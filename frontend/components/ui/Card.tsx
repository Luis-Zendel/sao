import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> { children: React.ReactNode }

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4",
        "shadow-sm transition-colors",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-4", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-sm font-semibold text-[var(--txt)] leading-tight", className)}>
      {children}
    </h3>
  );
}

export function CardSubtitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--txt-3)] mt-0.5">{children}</p>;
}
