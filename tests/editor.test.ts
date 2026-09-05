import { describe, expect, it, vi } from "vitest";
import { EXAMPLE_BRIEF, SEED_TEMPLATES } from "@/lib/catalog";
import { buildDeterministicDeck } from "@/lib/generate";
import {
  deckHistoryReducer,
  emptyHistory,
  sameDeckContent,
} from "@/lib/deck-history";
import { createSlideReportCache } from "@/lib/slide-reports";
import { checkSlide } from "@/lib/quality";
import type { Deck } from "@/lib/domain";

const makeDeck = () =>
  buildDeterministicDeck(EXAMPLE_BRIEF, SEED_TEMPLATES, "coral", 4);
const title = (deck: Deck, value: string): Deck => ({
  ...deck,
  slides: deck.slides.map((s, i) =>
    i ? s : { ...s, values: { ...s.values, title: value } },
  ),
});

describe("editing transactions", () => {
  it("undoes an entire continuous input and redoes it without losing the original", () => {
    const original = makeDeck();
    let state = emptyHistory,
      current = original;
    for (let n = 1; n <= 100; n++) {
      const next = title(current, "가".repeat(n));
      state = deckHistoryReducer(state, {
        type: "edit",
        before: current,
        next,
        key: "title",
        at: n * 20,
      });
      current = next;
    }
    state = deckHistoryReducer(state, { type: "undo", current });
    expect(sameDeckContent(state.draft!, original)).toBe(true);
    state = deckHistoryReducer(state, { type: "redo", current: original });
    expect(state.draft!.slides[0].values.title).toBe("가".repeat(100));
  });
  it("separates pauses, field changes and blur into distinct undo steps", () => {
    const original = makeDeck();
    const a = title(original, "첫 입력"),
      b = title(a, "잠시 후 입력"),
      c = { ...b, title: "다른 필드" };
    let state = deckHistoryReducer(emptyHistory, {
      type: "edit",
      before: original,
      next: a,
      key: "title",
      at: 0,
    });
    state = deckHistoryReducer(state, {
      type: "edit",
      before: a,
      next: b,
      key: "title",
      at: 1500,
    });
    state = deckHistoryReducer(state, {
      type: "edit",
      before: b,
      next: c,
      key: "deck-title",
      at: 1600,
    });
    state = deckHistoryReducer(state, { type: "end-group" });
    state = deckHistoryReducer(state, {
      type: "edit",
      before: c,
      next: { ...c, title: "다시 입력" },
      key: "deck-title",
      at: 1700,
    });
    expect(state.past).toHaveLength(4);
  });
  it("drops the redo branch after a new edit and clears history on commit", () => {
    const original = makeDeck(),
      edited = title(original, "편집");
    let state = deckHistoryReducer(emptyHistory, {
      type: "edit",
      before: original,
      next: edited,
      at: 0,
    });
    state = deckHistoryReducer(state, { type: "undo", current: edited });
    state = deckHistoryReducer(state, {
      type: "edit",
      before: original,
      next: title(original, "새 분기"),
      at: 2000,
    });
    expect(state.future).toEqual([]);
    expect(deckHistoryReducer(state, { type: "reset" })).toEqual(emptyHistory);
  });
  it("compares editable content, ignoring server metadata and value key order", () => {
    const deck = makeDeck();
    const same = {
      ...deck,
      version: deck.version + 1,
      updatedAt: "2030-01-01",
      slides: deck.slides.map((s) => ({
        ...s,
        values: Object.fromEntries(Object.entries(s.values).reverse()),
      })),
    };
    expect(sameDeckContent(deck, same)).toBe(true);
    expect(
      sameDeckContent(deck, { ...deck, slides: [...deck.slides].reverse() }),
    ).toBe(false);
  });
});

describe("incremental slide validation", () => {
  it("checks only the edited slide and reuses unchanged reports", () => {
    const check = vi.fn(checkSlide),
      reports = createSlideReportCache(check),
      deck = makeDeck();
    const first = reports(deck, SEED_TEMPLATES);
    const next = reports(title(deck, "새 제목"), SEED_TEMPLATES);
    expect(check).toHaveBeenCalledTimes(deck.slides.length + 1);
    expect(next[1]).toBe(first[1]);
    expect(next[0]).not.toBe(first[0]);
  });
  it("invalidates reports when source text or the exact template snapshot changes", () => {
    const check = vi.fn(checkSlide),
      reports = createSlideReportCache(check),
      deck = makeDeck();
    reports(deck, SEED_TEMPLATES);
    reports({ ...deck, brief: "원문 변경" }, SEED_TEMPLATES);
    expect(check).toHaveBeenCalledTimes(deck.slides.length * 2);
    reports(
      { ...deck, brief: "원문 변경" },
      SEED_TEMPLATES.map((t) => ({ ...t })),
    );
    expect(check).toHaveBeenCalledTimes(deck.slides.length * 3);
  });
});
