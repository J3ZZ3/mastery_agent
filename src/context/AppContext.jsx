import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((message, tone = "info") => {
    setToast({ message, tone, id: Date.now() });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5200);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const value = useMemo(
    () => ({
      notify,
      toast,
      dismissToast,
    }),
    [notify, toast, dismissToast],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used inside AppProvider");
  }
  return context;
}
