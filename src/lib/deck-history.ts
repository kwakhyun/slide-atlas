import type { Deck } from "./domain";

export function sameDeckContent(a: Deck, b: Deck): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.slides.length === b.slides.length &&
    a.slides.every((slide, i) => {
      const other = b.slides[i];
      return (
        slide.id === other.id &&
        slide.theme === other.theme &&
        JSON.stringify(slide.brand ?? null) ===
          JSON.stringify(other.brand ?? null) &&
        slide.templateId === other.templateId &&
        slide.templateVersion === other.templateVersion &&
        JSON.stringify(slide.sources ?? {}) ===
          JSON.stringify(other.sources ?? {}) &&
        JSON.stringify(slide.generation ?? null) ===
          JSON.stringify(other.generation ?? null) &&
        Object.keys(slide.values).length === Object.keys(other.values).length &&
        Object.entries(slide.values).every(
          ([key, value]) => other.values[key] === value,
        )
      );
    })
  );
}

export type DeckHistory = {
  draft: Deck | null;
  past: Deck[];
  future: Deck[];
  group: { key: string; at: number } | null;
};
export const emptyHistory: DeckHistory = {
  draft: null,
  past: [],
  future: [],
  group: null,
};
type Action =
  | { type: "edit"; before: Deck; next: Deck; key?: string; at: number }
  | { type: "undo" | "redo"; current: Deck }
  | { type: "reset" }
  | { type: "end-group" };

export function deckHistoryReducer(
  state: DeckHistory,
  action: Action,
): DeckHistory {
  if (action.type === "reset") return emptyHistory;
  if (action.type === "end-group")
    return state.group ? { ...state, group: null } : state;
  if (action.type === "edit") {
    if (sameDeckContent(action.before, action.next)) return state;
    const grouped =
      action.key &&
      state.group?.key === action.key &&
      action.at - state.group.at < 1000;
    return {
      draft: action.next,
      past: grouped ? state.past : [...state.past.slice(-49), action.before],
      future: [],
      group: action.key ? { key: action.key, at: action.at } : null,
    };
  }
  const source = action.type === "undo" ? state.past : state.future;
  const next = source.at(-1);
  if (!next) return state;
  return action.type === "undo"
    ? {
        draft: next,
        past: source.slice(0, -1),
        future: [...state.future.slice(-49), action.current],
        group: null,
      }
    : {
        draft: next,
        past: [...state.past.slice(-49), action.current],
        future: source.slice(0, -1),
        group: null,
      };
}
