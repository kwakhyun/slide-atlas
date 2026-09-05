"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, CircleHelp, X } from "lucide-react";
import { api } from "@/lib/api-client";
import type { Deck, SlideTemplate, WorkspaceState } from "@/lib/domain";

type Notify = (message: string, error?: boolean) => void;
type WorkspaceStore = {
  state: WorkspaceState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<WorkspaceState>;
  commitDeck: (deck: Deck) => void;
  removeDeck: (id: string) => void;
  commitTemplate: (template: SlideTemplate) => void;
};
const StoreContext = createContext<WorkspaceStore | null>(null);
const NotifyContext = createContext<Notify>(() => {});

function Notifications({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback<Notify>((message, error = false) => {
    setToast({ message, error });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 5500);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <NotifyContext.Provider value={notify}>
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleHelp size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button aria-label="알림 닫기" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </NotifyContext.Provider>
  );
}

export function WorkspaceProvider({
  children,
  active,
}: {
  children: ReactNode;
  active: boolean;
}) {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Promise<WorkspaceState> | null>(null);
  const revision = useRef(0);
  const refresh = useCallback((): Promise<WorkspaceState> => {
    if (pending.current) return pending.current;
    pending.current = (async () => {
      try {
        // A response begun before a local commit must not overwrite that commit.
        let data: WorkspaceState;
        let startedAt: number;
        do {
          startedAt = revision.current;
          data = await api<WorkspaceState>("/workspace?view=core");
        } while (startedAt !== revision.current);
        setState(data);
        setError(null);
        return data;
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "연결하지 못했습니다.",
        );
        throw error;
      } finally {
        pending.current = null;
        setLoading(false);
      }
    })();
    return pending.current;
  }, []);
  useEffect(() => {
    if (active) void refresh().catch(() => {});
  }, [active, refresh]);
  const commitDeck = useCallback((deck: Deck) => {
    revision.current++;
    setState((current) =>
      current
        ? {
            ...current,
            decks: [
              deck,
              ...current.decks.filter((item) => item.id !== deck.id),
            ],
          }
        : current,
    );
  }, []);
  const removeDeck = useCallback((id: string) => {
    revision.current++;
    setState((current) =>
      current
        ? { ...current, decks: current.decks.filter((item) => item.id !== id) }
        : current,
    );
  }, []);
  const commitTemplate = useCallback((template: SlideTemplate) => {
    revision.current++;
    setState((current) =>
      current
        ? {
            ...current,
            templates: [
              template,
              ...current.templates.filter((item) => item.id !== template.id),
            ],
          }
        : current,
    );
  }, []);
  const value = useMemo(
    () => ({
      state,
      loading,
      error,
      refresh,
      commitDeck,
      removeDeck,
      commitTemplate,
    }),
    [state, loading, error, refresh, commitDeck, removeDeck, commitTemplate],
  );
  return (
    <StoreContext.Provider value={value}>
      <Notifications>{children}</Notifications>
    </StoreContext.Provider>
  );
}

export function useWorkspace() {
  const store = useContext(StoreContext);
  const notify = useContext(NotifyContext);
  if (!store) throw new Error("Workspace provider is required");
  return { ...store, notify };
}
