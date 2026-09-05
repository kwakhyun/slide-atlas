"use client";
import { useState } from "react";
import type { Deck } from "@/lib/domain";
import { useApiResource } from "../use-api-resource";
import { useWorkspace } from "../workspace-state";
import { api } from "@/lib/api-client";
export function CollaborationPanel({
  deck,
  dirty,
}: {
  deck: Deck;
  dirty: boolean;
}) {
  const { notify } = useWorkspace();
  const [open, setOpen] = useState(false),
    [body, setBody] = useState(""),
    [link, setLink] = useState(""),
    [days, setDays] = useState(1),
    [busy, setBusy] = useState(false);
  const comments = useApiResource<
    { id: string; body: string; username: string; resolved: boolean }[]
  >(open ? `/decks/${deck.id}/comments` : null);
  const shares = useApiResource<
    { id: string; expiresAt: string; revoked: boolean }[]
  >(open ? `/decks/${deck.id}/shares` : null);
  async function write(path: string, method: string, data: unknown) {
    setBusy(true);
    try {
      const result = await api<{ path?: string }>(path, {
        method,
        body: JSON.stringify(data),
      });
      if (result.path)
        setLink(new URL(result.path, window.location.origin).href);
      else setBody("");
      comments.retry();
      shares.retry();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="operation-panel"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>검수 댓글과 읽기 전용 공유</summary>
      <h3>검수 댓글</h3>
      <p>팀 계정으로 로그인한 작성자와 검수자가 의견을 남길 수 있습니다.</p>
      {comments.error && <p role="alert">{comments.error}</p>}
      {comments.data?.map((c) => (
        <article key={c.id}>
          <strong>
            {c.username} · {c.resolved ? "해결됨" : "확인 필요"}
          </strong>
          <p>{c.body}</p>
          <button
            className="btn small"
            disabled={busy}
            onClick={() =>
              void write(`/decks/${deck.id}/comments`, "PATCH", {
                id: c.id,
                resolved: !c.resolved,
              })
            }
          >
            {c.resolved ? "다시 열기" : "해결 표시"}
          </button>
        </article>
      ))}
      <label htmlFor="review-comment">검수 의견</label>
      <textarea
        id="review-comment"
        rows={3}
        maxLength={2000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button
        className="btn"
        disabled={busy || !body.trim()}
        onClick={() =>
          void write(`/decks/${deck.id}/comments`, "POST", { body })
        }
      >
        댓글 등록
      </button>
      <h3>공유 사본</h3>
      <p>
        저장된 슬라이드와 사용한 템플릿의 사본을 만듭니다. 링크를 가진 사람이
        열람할 수 있습니다. 브리프와 원문 근거, 생성 사용량은 제외합니다.
      </p>
      <label htmlFor="share-days">공유 유효 기간</label>
      <select
        id="share-days"
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
      >
        {[1, 3, 7].map((n) => (
          <option key={n} value={n}>
            {n}일
          </option>
        ))}
      </select>
      <button
        className="btn"
        disabled={busy || dirty}
        onClick={() =>
          void write(`/decks/${deck.id}/shares`, "POST", {
            expectedVersion: deck.version,
            days,
          })
        }
      >
        읽기 전용 링크 만들기
      </button>
      {dirty && <p>최신 내용을 공유하려면 먼저 저장하세요.</p>}
      {link && (
        <p role="status">
          <a href={link} target="_blank" rel="noreferrer">
            생성한 공유 사본 열기
          </a>
          <input aria-label="공유 링크" readOnly value={link} />
        </p>
      )}
      {shares.data?.map((s) => (
        <p key={s.id}>
          {new Date(s.expiresAt).toLocaleDateString("ko-KR")} 만료 ·{" "}
          {s.revoked ? "해제됨" : "해제되지 않음"}
          <button
            className="btn small"
            disabled={busy || s.revoked}
            onClick={() =>
              void write(`/decks/${deck.id}/shares`, "DELETE", { id: s.id })
            }
          >
            공유 해제
          </button>
        </p>
      ))}
      {shares.error && <p role="alert">{shares.error}</p>}
    </details>
  );
}
