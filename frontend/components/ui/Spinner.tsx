import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn(
      "w-5 h-5 border-2 border-[var(--border)] border-t-[#FF441F] rounded-full animate-spin",
      className
    )} />
  );
}

export function LoadingState({ message = "Cargando..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Spinner className="w-8 h-8" />
      <p className="text-sm text-[var(--txt-3)]">{message}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-500 text-lg font-bold">
        !
      </div>
      <p className="text-sm text-[var(--txt-2)]">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-xs text-[#FF441F] hover:underline">
          Reintentar
        </button>
      )}
    </div>
  );
}
