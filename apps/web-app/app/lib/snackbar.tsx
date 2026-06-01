import { type ReactNode, createContext, use, useCallback, useMemo, useState } from "react";

/**
 * Minimal snackbar used for the generic, non-revealing "link unavailable"
 * message (ADR 0016). The same copy is shown whether a target is missing or
 * merely inaccessible, so nothing leaks about object existence.
 */
const UNAVAILABLE_LINK_MESSAGE = "That link isn't available.";

interface SnackbarContextValue {
  show: (message: string) => void;
  showUnavailableLink: () => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  const show = useCallback((next: string) => {
    setMessage(next);
    window.setTimeout(() => setMessage(null), 4000);
  }, []);

  const showUnavailableLink = useCallback(() => {
    show(UNAVAILABLE_LINK_MESSAGE);
  }, [show]);

  const contextValue = useMemo(() => ({ show, showUnavailableLink }), [show, showUnavailableLink]);

  return (
    <SnackbarContext.Provider value={contextValue}>
      {children}
      {message ? (
        <output className="fixed inset-x-0 bottom-4 z-50 mx-auto block w-fit max-w-[90vw] rounded-md bg-neutral-800 px-4 py-2 text-center text-sm text-neutral-100 shadow-lg">
          {message}
        </output>
      ) : null}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarContextValue {
  const context = use(SnackbarContext);
  if (!context) {
    throw new Error("useSnackbar must be used within a SnackbarProvider");
  }
  return context;
}
