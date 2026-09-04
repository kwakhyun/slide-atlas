"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EXAMPLE_BRIEF } from "@/lib/catalog";
import {
  type Deck,
  type Slide,
  type SlideTemplate,
  type ThemeId,
  type WorkspaceState,
} from "@/lib/domain";
import { mapSourceToTemplate } from "@/lib/generate";
import { checkSlide } from "@/lib/quality";
import { ApiError, api } from "../workspace";
import { useUnsavedWarning } from "../use-unsaved-warning";

interface Options {
  state: WorkspaceState;
  initialTemplateId?: string;
  refresh: () => Promise<WorkspaceState>;
  notify: (message: string, error?: boolean) => void;
}

export function useStudioController({
  state,
  initialTemplateId,
  refresh,
  notify,
}: Options) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Deck | null>(null);
  const [history, setHistory] = useState<Deck[]>([]);
  const [future, setFuture] = useState<Deck[]>([]);
  const [index, setIndex] = useState(0);
  const [brief, setBrief] = useState(EXAMPLE_BRIEF);
  const [theme, setTheme] = useState<ThemeId>("coral");
  const [count, setCount] = useState(4);
  const [provider, setProvider] = useState<"deterministic" | "openai">(
    "deterministic",
  );
  const [accessCode, setAccessCode] = useState("");
  const [tab, setTab] = useState<"brief" | "content">("brief");
  const [busy, setBusy] = useState<string | null>(null);
  const [guides, setGuides] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [allThemes, setAllThemes] = useState(false);
  const [deckMenuOpen, setDeckMenuOpen] = useState(false);
  const [deckDialog, setDeckDialog] = useState<"rename" | "delete" | null>(
    null,
  );
  const [renameTitle, setRenameTitle] = useState("");
  const [conflictOpen, setConflictOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"preview" | "input">("preview");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const appliedTemplate = useRef<string | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (localStorage.getItem("slide-atlas-onboarding-v1") !== "done")
        setOnboardingOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (busy !== "generate") return;
    const first = window.setTimeout(() => setGenerationStep(1), 450);
    const second = window.setTimeout(() => setGenerationStep(2), 1300);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [busy]);
  useEffect(() => {
    const active = filmstripRef.current?.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    active?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [index]);
  useEffect(() => {
    if (!initialTemplateId || appliedTemplate.current === initialTemplateId)
      return;
    const target = state.templates.find(
      (item) => item.id === initialTemplateId && item.status === "approved",
    );
    const base = state.decks[0];
    if (!target || !base) {
      notify("선택한 승인 템플릿을 찾을 수 없습니다.", true);
      return;
    }
    const current = base.slides[0];
    const frame = window.requestAnimationFrame(() => {
      appliedTemplate.current = initialTemplateId;
      setSelectedId(base.id);
      setDraft({
        ...base,
        slides: base.slides.map((item, itemIndex) =>
          itemIndex === 0
            ? {
                ...current,
                templateId: target.id,
                templateVersion: target.version,
                values: mapSourceToTemplate(base.brief, target),
              }
            : item,
        ),
      });
      setHistory([base]);
      setFuture([]);
      setIndex(0);
      setTab("content");
      notify(`“${target.name}” 템플릿을 첫 슬라이드에 적용했습니다.`);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialTemplateId, notify, state]);
  useUnsavedWarning(!!draft);

  const selected =
    state.decks.find((deck) => deck.id === selectedId) ?? state.decks[0];
  if (!selected) throw new Error("프레젠테이션 초기 데이터가 없습니다.");
  const deck = draft?.id === selected.id ? draft : selected;
  const slideIndex = Math.min(index, deck.slides.length - 1);
  const slide = deck.slides[slideIndex];
  const template = state.templates.find((item) => item.id === slide.templateId);
  if (!template) throw new Error("슬라이드 템플릿을 찾을 수 없습니다.");
  const quality = checkSlide(slide, template, deck.brief);
  const dirty = draft?.id === selected.id;
  const approved = state.templates.filter((item) => item.status === "approved");

  function update(next: Deck) {
    setHistory((items) => [...items.slice(-19), deck]);
    setFuture([]);
    setDraft(next);
  }
  function updateSlide(patch: Partial<Slide>) {
    update({
      ...deck,
      slides: deck.slides.map((item, itemIndex) =>
        itemIndex === slideIndex ? { ...item, ...patch } : item,
      ),
    });
  }
  function applyTheme(value: ThemeId) {
    setTheme(value);
    update({
      ...deck,
      slides: deck.slides.map((item, itemIndex) =>
        allThemes || itemIndex === slideIndex
          ? { ...item, theme: value }
          : item,
      ),
    });
  }
  async function save(): Promise<Deck> {
    if (!dirty) return deck;
    setBusy("save");
    try {
      const saved = await api<Deck>(`/decks/${deck.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: deck.title,
          slides: deck.slides,
          expectedVersion: deck.version,
        }),
      });
      await refresh();
      setDraft(null);
      setHistory([]);
      setFuture([]);
      notify("내용과 스타일을 저장했습니다.");
      return saved;
    } catch (error) {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT")
        setConflictOpen(true);
      notify((error as Error).message, true);
      throw error;
    } finally {
      setBusy(null);
    }
  }
  async function generate() {
    if (dirty) {
      notify("편집 중인 슬라이드를 먼저 저장해 주세요.", true);
      return;
    }
    setGenerationStep(0);
    setBusy("generate");
    try {
      const result = await api<Deck>("/decks", {
        method: "POST",
        body: JSON.stringify({ brief, theme, count, provider }),
        headers:
          provider === "openai" ? { "X-AI-Access-Code": accessCode } : {},
      });
      await refresh();
      setSelectedId(result.id);
      setDraft(null);
      setIndex(0);
      setHistory([]);
      setFuture([]);
      notify(
        `${result.slides.length}장의 슬라이드를 만들었습니다. 품질 검사를 확인해 주세요.`,
      );
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  }
  async function download(format: "pptx" | "svg" | "json") {
    setExportOpen(false);
    try {
      await save();
      setBusy("export");
      const response = await fetch(
        `/api/decks/${deck.id}/export?format=${format}&slide=${slideIndex}`,
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message ?? "내보내기에 실패했습니다.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `slide-atlas${format === "svg" ? `-${slideIndex + 1}` : ""}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`${format.toUpperCase()} 파일을 내보냈습니다.`);
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  }
  function moveSlide(direction: -1 | 1) {
    const target = slideIndex + direction;
    if (target < 0 || target >= deck.slides.length) return;
    const slides = [...deck.slides];
    [slides[slideIndex], slides[target]] = [slides[target], slides[slideIndex]];
    update({ ...deck, slides });
    setIndex(target);
  }
  function removeSlide() {
    if (deck.slides.length <= 1) return;
    update({
      ...deck,
      slides: deck.slides.filter((_, itemIndex) => itemIndex !== slideIndex),
    });
    setIndex(Math.max(0, slideIndex - 1));
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [...items.slice(-19), deck]);
    setDraft(previous);
    setHistory((items) => items.slice(0, -1));
  }
  function redo() {
    const next = future.at(-1);
    if (!next) return;
    setHistory((items) => [...items.slice(-19), deck]);
    setDraft(next);
    setFuture((items) => items.slice(0, -1));
  }
  async function duplicateCurrentDeck() {
    setDeckMenuOpen(false);
    setBusy("duplicate");
    try {
      const copy = await api<Deck>(`/decks/${deck.id}/duplicate`, {
        method: "POST",
      });
      await refresh();
      setSelectedId(copy.id);
      setDraft(null);
      setHistory([]);
      setFuture([]);
      setIndex(0);
      notify("프레젠테이션 복사본을 만들었습니다.");
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  }
  async function renameCurrentDeck() {
    const title = renameTitle.trim();
    if (!title) return;
    setBusy("rename");
    try {
      const saved = await api<Deck>(`/decks/${deck.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          slides: deck.slides,
          expectedVersion: deck.version,
        }),
      });
      await refresh();
      setSelectedId(saved.id);
      setDraft(null);
      setHistory([]);
      setFuture([]);
      setDeckDialog(null);
      notify("프레젠테이션 이름을 변경했습니다.");
    } catch (error) {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT")
        setConflictOpen(true);
      notify((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  }
  async function deleteCurrentDeck() {
    setBusy("delete");
    try {
      await api(`/decks/${deck.id}`, { method: "DELETE" });
      const next = await refresh();
      setSelectedId(next.decks[0]?.id ?? null);
      setDraft(null);
      setHistory([]);
      setFuture([]);
      setIndex(0);
      setDeckDialog(null);
      notify("프레젠테이션을 삭제했습니다.");
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  }
  function downloadRecoveryDraft() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(deck, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `slide-atlas-recovery-${deck.id}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function present() {
    await save();
    router.push(`/present/${deck.id}`);
  }
  function selectTemplate(target: SlideTemplate) {
    updateSlide({
      templateId: target.id,
      templateVersion: target.version,
      values: mapSourceToTemplate(deck.brief, target),
    });
    notify("내용을 새 템플릿 슬롯에 다시 배치했습니다.");
  }

  return {
    accessCode,
    allThemes,
    approved,
    applyTheme,
    brief,
    busy,
    conflictOpen,
    count,
    deck,
    deckDialog,
    deckMenuOpen,
    deleteCurrentDeck,
    dirty,
    download,
    downloadRecoveryDraft,
    duplicateCurrentDeck,
    exportOpen,
    filmstripRef,
    future,
    generate,
    generationStep,
    guides,
    history,
    index,
    mobileView,
    moveSlide,
    onboardingOpen,
    present,
    provider,
    quality,
    qualityOpen,
    redo,
    removeSlide,
    renameCurrentDeck,
    renameTitle,
    save,
    selected,
    selectTemplate,
    setAccessCode,
    setAllThemes,
    setBrief,
    setConflictOpen,
    setCount,
    setDeckDialog,
    setDeckMenuOpen,
    setDraft,
    setExportOpen,
    setFuture,
    setGuides,
    setHistory,
    setIndex,
    setMobileView,
    setOnboardingOpen,
    setProvider,
    setQualityOpen,
    setRenameTitle,
    setSelectedId,
    setTab,
    slide,
    slideIndex,
    tab,
    template,
    undo,
    update,
    updateSlide,
  };
}
