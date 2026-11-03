import { useCallback, useRef, useState } from 'react';

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

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="fixed left-1/2 -translate-x-1/2 z-50 rounded-full bg-fg text-bg px-4 py-2.5 text-[13.5px] font-medium shadow-lg" style={{ top: 'calc(env(safe-area-inset-top) + 64px)' }}>
      {message}
    </div>
  );
}
