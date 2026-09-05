"use client";
import { useRouter } from "next/navigation";
import type { Deck, WorkspaceState } from "@/lib/domain";
import { api, ApiError } from "@/lib/api-client";
import { useWorkspace } from "../workspace-state";
type Options = {
  deck: Deck;
  dirty: boolean;
  slideIndex: number;
  state: WorkspaceState;
  reset: () => void;
  setBusy: (value: string | null) => void;
  notify: (message: string, error?: boolean) => void;
  setConflictOpen: (value: boolean) => void;
  setSelectedId: (id: string | null) => void;
  setIndex: (index: number) => void;
  setDeckMenuOpen: (value: boolean) => void;
  setDeckDialog: (value: "rename" | "delete" | null) => void;
  renameTitle: string;
  setExportOpen: (value: boolean) => void;
};

export function useDeckPersistence({
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
}: Options) {
  const router = useRouter();
  const { commitDeck, removeDeck } = useWorkspace();
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
      commitDeck(saved);
      reset();
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
  async function duplicateCurrentDeck() {
    setDeckMenuOpen(false);
    setBusy("duplicate");
    try {
      const copy = await api<Deck>(`/decks/${deck.id}/duplicate`, {
        method: "POST",
      });
      commitDeck(copy);
      setSelectedId(copy.id);
      reset();

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
      commitDeck(saved);
      setSelectedId(saved.id);
      reset();

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
      removeDeck(deck.id);
      setSelectedId(
        state.decks.find((item) => item.id !== deck.id)?.id ?? null,
      );
      reset();

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
  return {
    save,
    download,
    duplicateCurrentDeck,
    renameCurrentDeck,
    deleteCurrentDeck,
    downloadRecoveryDraft,
    present,
  };
}
