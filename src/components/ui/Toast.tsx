import { useCallback, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const t = useRef<number>();
  const show = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setToast(null), 2200);
  }, []);
  return { toast, show };
}

/** Notification brève et discrète (confirmation d'action). */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" key={message} className="fixed left-1/2 -translate-x-1/2 z-[70] no-print pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top) + 68px)' }}>
      <div className="flex items-center gap-2 rounded-full bg-fg text-bg pl-3 pr-4 h-10 text-[13.5px] font-medium shadow-lg animate-scale-in whitespace-nowrap">
        <CheckCircle2 className="h-4 w-4 opacity-80" strokeWidth={2} />
        {message}
      </div>
    </div>
  );
}
