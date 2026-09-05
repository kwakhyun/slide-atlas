"use client";

import { useCallback, useMemo, useReducer } from "react";
import type { Deck } from "@/lib/domain";
import {
  deckHistoryReducer,
  emptyHistory,
  sameDeckContent,
} from "@/lib/deck-history";

export function useDeckEditor(selected: Deck, busy: boolean) {
  const [history, dispatch] = useReducer(deckHistoryReducer, emptyHistory);
  const draft = history.draft?.id === selected.id ? history.draft : null;
  const dirty = useMemo(
    () => !!draft && !sameDeckContent(draft, selected),
    [draft, selected],
  );
  const deck = dirty && draft ? draft : selected;
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const endGroup = useCallback(() => dispatch({ type: "end-group" }), []);
  const update = (next: Deck, key?: string) => {
    if (!busy)
      dispatch({
        type: "edit",
        before: deck,
        next,
        key,
        at: performance.now(),
      });
  };
  const start = useCallback((before: Deck, next: Deck) => {
    dispatch({ type: "reset" });
    dispatch({ type: "edit", before, next, at: performance.now() });
  }, []);
  return {
    deck,
    dirty,
    update,
    reset,
    endGroup,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo: () => {
      if (!busy) dispatch({ type: "undo", current: deck });
    },
    redo: () => {
      if (!busy) dispatch({ type: "redo", current: deck });
    },
    start,
  };
}
