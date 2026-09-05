"use client";
import { useEffect, useRef, useState } from "react";
import {
  draftKey,
  readDraft,
  writeDraft,
  type LocalDraft,
} from "@/lib/draft-storage";
import { sameDeckContent } from "@/lib/deck-history";
import type { Deck } from "@/lib/domain";

export function useLocalDraft(
  workspaceId: string,
  selected: Deck,
  deck: Deck,
  dirty: boolean,
) {
  const key = draftKey(workspaceId, selected.id);
  const [loaded, setLoaded] = useState<{
    key: string;
    draft: LocalDraft | null;
  } | null>(null);
  const [status, setStatus] = useState("");
  const edited = useRef(false);
  const owner = useRef("default");
  const recoveredOwner = useRef<string | null>(null);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    edited.current = false;
    try {
      owner.current =
        sessionStorage.getItem("atlas-draft-writer") ?? crypto.randomUUID();
      sessionStorage.setItem("atlas-draft-writer", owner.current);
    } catch {
      owner.current = crypto.randomUUID();
    }
    void readDraft(key, owner.current)
      .then((draft) => {
        if (cancelled) return;
        if (
          draft &&
          sameDeckContent(
            { ...selected, title: draft.title, slides: draft.slides },
            selected,
          )
        ) {
          void writeDraft(key, null, draft.owner ?? owner.current).catch(
            () => {},
          );
          setLoaded({ key, draft: null });
        } else setLoaded({ key, draft });
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({ key, draft: null });
          setStatus(
            "이 브라우저에 초안을 보관할 수 없습니다. 서버에 저장해 주세요.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key, selected]);
  useEffect(() => {
    if (loaded?.key !== key || loaded.draft) return;
    if (!dirty && !edited.current) return;
    edited.current = dirty;
    let cancelled = false;
    // Queue transactions in edit order, including the delete after a successful save.
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        await writeDraft(key, dirty ? deck : null, owner.current);
        if (
          recoveredOwner.current &&
          (!dirty || recoveredOwner.current !== owner.current)
        ) {
          await writeDraft(key, null, recoveredOwner.current);
          recoveredOwner.current = null;
        }
      });
    void queue.current
      .then(() => {
        if (!cancelled) setStatus(dirty ? "이 브라우저에 초안 보관됨" : "");
      })
      .catch(() => {
        if (!cancelled)
          setStatus("초안 보관에 실패했습니다. 서버에 저장해 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, [key, deck, dirty, loaded]);
  return {
    recovery: loaded?.key === key ? loaded.draft : null,
    status,
    dismiss: () => {
      setLoaded({ key, draft: null });
      queue.current = queue.current
        .catch(() => {})
        .then(() =>
          writeDraft(key, null, loaded?.draft?.owner ?? owner.current),
        );
      void queue.current.catch(() => setStatus("초안을 지우지 못했습니다."));
    },
    accept: () => {
      recoveredOwner.current = loaded?.draft?.owner ?? null;
      setLoaded({ key, draft: null });
    },
  };
}
