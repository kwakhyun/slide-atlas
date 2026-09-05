"use client";

import { useEffect, useRef, useState, useMemo } from "react";
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
import { remapSlideValues, resolveSlideTemplate } from "@/lib/template-version";
import { api } from "@/lib/api-client";
import { useLocalDraft } from "./use-local-draft";
import { useDeckEditor } from "./use-deck-editor";
import { createSlideReportCache } from "@/lib/slide-reports";
import { useDeckPersistence } from "./use-deck-persistence";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const selected =
    state.decks.find((item) => item.id === selectedId) ?? state.decks[0];
  const readOnly = state.role === "reviewer" || state.role === "viewer";
  const editor = useDeckEditor(selected, !!busy || readOnly);
  const {
    deck,
    dirty,
    update,
    undo,
    redo,
    reset,
    endGroup,
    canUndo,
    canRedo,
    start,
  } = editor;
  const localDraft = useLocalDraft(state.workspaceId, selected, deck, dirty);
  const [selectedSlot, setSelectedSlot] = useState<string | undefined>();
  function focusSlot(key: string) {
    setTab("content");
    setMobileView("input");
    setGuides(true);
    setSelectedSlot(key);
    window.requestAnimationFrame(() =>
      document.getElementById(`slot-${key}`)?.focus(),
    );
  }
  function restoreDraft() {
    const saved = localDraft.recovery;
    if (!saved) return;
    const available = [...state.templateVersions, ...state.templates];
    if (
      saved.slides.some(
        (s) =>
          !available.some(
            (t) => t.id === s.templateId && t.version === s.templateVersion,
          ),
      )
    ) {
      notify(
        "초안에 사용한 템플릿 버전을 불러올 수 없습니다. 초안 JSON을 내려받아 보관해 주세요.",
        true,
      );
      return;
    }
    start(selected, {
      ...selected,
      version: saved.baseVersion,
      title: saved.title,
      slides: saved.slides,
    });
    localDraft.accept();
    setTab("content");
    setMobileView("input");
  }
  const slideIndex = Math.min(index, deck.slides.length - 1);
  const {
    save,
    download,
    duplicateCurrentDeck,
    renameCurrentDeck,
    deleteCurrentDeck,
    downloadRecoveryDraft,
    present,
  } = useDeckPersistence({
    deck,
    dirty,
    slideIndex,
    state,
    reset,
    setBusy,
    notify,
    setConflictOpen,
    setSelectedId,
    setIndex,
    setDeckMenuOpen,
    setDeckDialog,
    renameTitle,
    setExportOpen,
  });
  const reportCache = useMemo(() => createSlideReportCache(), []);
  const appliedTemplate = useRef<string | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setOnboardingOpen(
          localStorage.getItem("slide-atlas-onboarding-v1") !== "done",
        );
      } catch {
        setOnboardingOpen(true);
      }
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
    const strip = filmstripRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !active) return;
    strip.scrollTo({
      left:
        strip.scrollLeft +
        active.getBoundingClientRect().left -
        strip.getBoundingClientRect().left -
        (strip.clientWidth - active.clientWidth) / 2,
      behavior: "smooth",
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
      start(base, {
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

      setIndex(0);
      setTab("content");
      notify(`“${target.name}” 템플릿을 첫 슬라이드에 적용했습니다.`);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialTemplateId, notify, state, start]);
  useUnsavedWarning(dirty);

  const slide = deck.slides[slideIndex];
  const renderTemplates = useMemo(
    () => [...state.templateVersions, ...state.templates],
    [state.templateVersions, state.templates],
  );
  const template = resolveSlideTemplate(slide, renderTemplates);
  const newerTemplate = state.templates.find(
    (item) =>
      item.id === template.id &&
      item.version > template.version &&
      item.status === "approved",
  );
  const slideReports = useMemo(
    () => reportCache(deck, renderTemplates),
    [reportCache, deck, renderTemplates],
  );
  const quality = slideReports[slideIndex];
  const needsReview = slideReports.flatMap((report, index) =>
    report.errors || report.warnings ? [index] : [],
  );
  const approved = useMemo(
    () => state.templates.filter((item) => item.status === "approved"),
    [state.templates],
  );

  function updateSlide(patch: Partial<Slide>, key?: string) {
    update(
      {
        ...deck,
        slides: deck.slides.map((item, itemIndex) =>
          itemIndex === slideIndex ? { ...item, ...patch } : item,
        ),
      },
      key,
    );
  }
  function applyTheme(value: ThemeId) {
    if (busy) return;
    setTheme(value);
    update({
      ...deck,
      slides: deck.slides.map((item, itemIndex) =>
        allThemes || itemIndex === slideIndex
          ? { ...item, theme: value, brand: undefined }
          : item,
      ),
    });
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
      const refreshed = await refresh();
      setSelectedId(result.id);
      reset();
      setIndex(0);

      completeOnboarding();
      setTab("content");
      setMobileView("input");
      const reports = result.slides.map((item) =>
        checkSlide(
          item,
          resolveSlideTemplate(item, refreshed.templateVersions),
          result.brief,
        ),
      );
      const firstIssue = reports.findIndex(
        (report) => report.errors || report.warnings,
      );
      setIndex(firstIssue < 0 ? 0 : firstIssue);
      setQualityOpen(firstIssue >= 0);
      notify(
        `${result.slides.length}장의 슬라이드를 만들었습니다. 품질 검사를 확인해 주세요.`,
      );
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
  function selectTemplate(target: SlideTemplate) {
    if (busy) return;
    const mapped = remapSlideValues(slide, template, target);
    if (mapped.unmapped.length) {
      notify(
        `새 구조에 옮길 수 없는 내용이 있어 변경하지 않았습니다: ${mapped.unmapped.map((slot) => slot.label).join(", ")}. 현재 내용을 먼저 보관하거나 정리해 주세요.`,
        true,
      );
      return;
    }
    updateSlide({
      templateId: target.id,
      templateVersion: target.version,
      values: mapped.values,
    });
    setQualityOpen(true);
    notify(
      "편집한 내용을 유지해 새 템플릿에 배치했습니다. 빈 영역과 넘침을 확인해 주세요.",
    );
  }

  function completeOnboarding() {
    try {
      localStorage.setItem("slide-atlas-onboarding-v1", "done");
    } catch {
      /* Storage is optional. */
    }
    setOnboardingOpen(false);
  }

  function selectDeck(id: string) {
    if (busy || dirty) return;
    setSelectedId(id);
    setIndex(0);
    reset();
  }
  function duplicateSlide() {
    if (busy || deck.slides.length >= 12) return;
    update({
      ...deck,
      slides: [
        ...deck.slides,
        { ...slide, id: crypto.randomUUID(), values: { ...slide.values } },
      ],
    });
    setIndex(deck.slides.length);
  }
  async function reloadDeck() {
    try {
      await refresh();
      reset();
      setConflictOpen(false);
      notify("서버의 최신 버전을 불러왔습니다.");
    } catch (error) {
      notify((error as Error).message, true);
    }
  }
  function editValue(key: string, value: string) {
    updateSlide(
      { values: { ...slide.values, [key]: value } },
      `${slide.id}:${key}`,
    );
  }

  function reviewSlide(index: number) {
    setIndex(index);
    setTab("content");
    setMobileView("input");
    setQualityOpen(true);
  }

  return {
    localDraft,
    restoreDraft,
    selectedSlot,
    focusSlot,
    updateSlide,
    setBusy,
    accessCode,
    allThemes,
    approved,
    applyTheme,
    brief,
    busy: readOnly ? "readonly" : busy,
    conflictOpen,
    count,
    completeOnboarding,
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
    canRedo,
    canUndo,
    endGroup,
    editValue,
    selectDeck,
    duplicateSlide,
    reloadDeck,
    generate,
    generationStep,
    guides,
    index,
    mobileView,
    needsReview,
    newerTemplate,
    moveSlide,
    onboardingOpen,
    present,
    provider,
    quality,
    qualityOpen,
    redo,
    renderTemplates,
    reviewSlide,
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
    setExportOpen,
    setGuides,
    setIndex,
    setMobileView,
    setOnboardingOpen,
    setProvider,
    setQualityOpen,
    setRenameTitle,
    setTab,
    slide,
    slideIndex,
    tab,
    template,
    undo,
  };
}
