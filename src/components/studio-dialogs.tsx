"use client";

import type { FormEvent } from "react";
import { Modal } from "./ui";
import type { Deck } from "@/lib/domain";

export function StudioDialogs({
  deck,
  mode,
  renameTitle,
  busy,
  conflictOpen,
  onRenameTitle,
  onCloseMode,
  onRename,
  onDelete,
  onCloseConflict,
  onDownloadRecovery,
  onReload,
}: {
  deck: Deck;
  mode: "rename" | "delete" | null;
  renameTitle: string;
  busy: boolean;
  conflictOpen: boolean;
  onRenameTitle: (value: string) => void;
  onCloseMode: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCloseConflict: () => void;
  onDownloadRecovery: () => void;
  onReload: () => void;
}) {
  return (
    <>
      {mode === "rename" && (
        <Modal
          title="프레젠테이션 이름 변경"
          subtitle="목록과 발표 화면에 표시할 이름을 입력해 주세요."
          onClose={onCloseMode}
        >
          <form
            className="modal-body compact-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              onRename();
            }}
          >
            <label className="field-label" htmlFor="deck-title">
              프레젠테이션 이름
            </label>
            <input
              id="deck-title"
              value={renameTitle}
              onChange={(event) => onRenameTitle(event.target.value)}
              minLength={1}
              maxLength={80}
              autoFocus
              required
            />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onCloseMode}>
                취소
              </button>
              <button
                className="btn dark"
                disabled={busy || !renameTitle.trim()}
              >
                이름 저장
              </button>
            </div>
          </form>
        </Modal>
      )}
      {mode === "delete" && (
        <Modal
          title="프레젠테이션 삭제"
          subtitle="이 작업은 되돌릴 수 없습니다."
          onClose={onCloseMode}
        >
          <div className="modal-body confirm-copy">
            <p>
              ‘{deck.title}’에 포함된 슬라이드 {deck.slides.length}개를
              삭제합니다.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={onCloseMode}>
                취소
              </button>
              <button className="btn danger" disabled={busy} onClick={onDelete}>
                삭제하기
              </button>
            </div>
          </div>
        </Modal>
      )}
      {conflictOpen && (
        <Modal
          title="새 버전이 저장되어 있습니다"
          subtitle="현재 편집 내용과 서버 버전이 충돌합니다. 먼저 복구 방법을 선택해 주세요."
          onClose={onCloseConflict}
        >
          <div className="modal-body confirm-copy">
            <p>
              다른 작업에서 같은 프레젠테이션을 먼저 저장했습니다. 현재 편집본을
              JSON으로 내려받거나 서버의 최신 버전을 불러올 수 있습니다.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={onDownloadRecovery}>
                내 변경 JSON 내려받기
              </button>
              <button className="btn dark" onClick={onReload}>
                최신 버전 불러오기
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
