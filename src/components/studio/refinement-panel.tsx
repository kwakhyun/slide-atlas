"use client";
import { useMemo, useState } from "react";
import type { Deck, Slide, SlideTemplate } from "@/lib/domain";
import { sourcePassages, suggestPassages } from "@/lib/source-evidence";
import { api } from "@/lib/api-client";

type Candidate = {
  deckVersion: number;
  slideId: string;
  values: Record<string, string>;
  generation?: Slide["generation"];
  provider: string;
};
export function RefinementPanel({
  deck,
  slide,
  template,
  dirty,
  busy,
  provider,
  accessCode,
  setBusy,
  updateSlide,
  notify,
}: {
  deck: Deck;
  slide: Slide;
  template: SlideTemplate;
  dirty: boolean;
  busy: string | null;
  provider: "deterministic" | "openai";
  accessCode: string;
  setBusy: (busy: string | null) => void;
  updateSlide: (patch: Partial<Slide>) => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const [slot, setSlot] = useState(template.slots[0].key);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [error, setError] = useState("");
  const [request, setRequest] = useState<{
    fingerprint: string;
    id: string;
  } | null>(null);
  const passages = useMemo(() => sourcePassages(deck.brief), [deck.brief]);
  const value = slide.values[slot] ?? "";
  const suggestions = suggestPassages(deck.brief, value);
  const linked = slide.sources?.[slot];
  async function regenerate(all: boolean) {
    setBusy("regenerate");
    setError("");
    setCandidate(null);
    const fingerprint = JSON.stringify([
      deck.id,
      deck.version,
      slide.id,
      all ? null : slot,
      provider,
    ]);
    const requestId =
      request?.fingerprint === fingerprint ? request.id : crypto.randomUUID();
    setRequest({ fingerprint, id: requestId });
    try {
      setCandidate(
        await api<Candidate>(`/decks/${deck.id}/regenerate`, {
          method: "POST",
          headers:
            provider === "openai" ? { "X-AI-Access-Code": accessCode } : {},
          body: JSON.stringify({
            requestId,
            expectedVersion: deck.version,
            slideId: slide.id,
            slot: all ? undefined : slot,
            provider,
          }),
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  function link(start: number) {
    const passage = passages.find((p) => p.start === start);
    if (!passage) return;
    updateSlide({
      sources: {
        ...slide.sources,
        [slot]: { start: passage.start, end: passage.end, value },
      },
    });
    notify("원문 근거를 연결했습니다. 변경사항을 저장해 주세요.");
  }
  return (
    <details className="refinement-panel">
      <summary>선택 슬라이드 다듬기 · 부분 재생성과 원문 근거</summary>
      <label htmlFor="refine-slot">다듬을 내용</label>
      <select
        id="refine-slot"
        value={slot}
        onChange={(e) => {
          setSlot(e.target.value);
          setCandidate(null);
        }}
      >
        {template.slots.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <p>
        생성 엔진:{" "}
        {provider === "openai"
          ? "OpenAI · 브리프 탭의 초대 코드 사용"
          : "규칙 기반"}
        . 저장된 원문을 사용해 후보를 만들고 적용 전에 비교합니다.
      </p>
      <button
        className="btn"
        disabled={dirty || !!busy}
        onClick={() => void regenerate(false)}
      >
        선택 내용 다시 생성
      </button>
      <button
        className="btn"
        disabled={dirty || !!busy}
        onClick={() => void regenerate(true)}
      >
        이 슬라이드 다시 생성
      </button>
      {dirty && <p>부분 재생성을 시작하려면 변경사항을 먼저 저장하세요.</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            className="btn small"
            onClick={() => {
              setRequest(null);
              setError("");
            }}
          >
            새 요청 준비
          </button>
        </p>
      )}
      {candidate && (
        <section aria-label="재생성 후보 비교">
          <h3>기존 내용과 후보 비교</h3>
          {Object.entries(candidate.values).map(([key, text]) => (
            <div key={key}>
              <strong>
                {template.slots.find((s) => s.key === key)?.label}
              </strong>
              <p>기존: {slide.values[key]}</p>
              <p>후보: {text || "원문 부족으로 비어 있음"}</p>
            </div>
          ))}
          <button
            className="btn"
            disabled={
              dirty ||
              !!busy ||
              candidate.deckVersion !== deck.version ||
              candidate.slideId !== slide.id
            }
            onClick={() => {
              updateSlide({
                values: { ...slide.values, ...candidate.values },
                generation: candidate.generation,
              });
              setCandidate(null);
              setRequest(null);
              notify("후보를 초안에 적용했습니다. 검토 후 저장하세요.");
            }}
          >
            후보 적용
          </button>
          <button className="btn" onClick={() => setCandidate(null)}>
            후보 닫기
          </button>
        </section>
      )}
      <h3>원문 근거 연결</h3>
      <p>
        문구와 수치가 겹치는 원문 후보입니다. 같은 대상과 주장을 설명하는지 직접
        확인하세요.
      </p>
      {linked && (
        <p role="status">
          {linked.value === value
            ? "연결된 원문"
            : "내용이 바뀌어 근거 재확인 필요"}
          : {deck.brief.slice(linked.start, linked.end)}
        </p>
      )}
      {suggestions.map((p) => (
        <button
          key={p.start}
          className="evidence-choice"
          disabled={!!busy}
          onClick={() => link(p.start)}
        >
          {p.text} — 근거로 연결
        </button>
      ))}
      <label htmlFor="source-passage">전체 원문에서 직접 선택</label>
      <select
        id="source-passage"
        value=""
        disabled={!!busy}
        onChange={(e) => link(Number(e.target.value))}
      >
        <option value="">근거 문장 선택</option>
        {passages.map((p) => (
          <option key={p.start} value={p.start}>
            {p.text}
          </option>
        ))}
      </select>
      {linked && (
        <button
          className="btn small"
          disabled={!!busy}
          onClick={() => {
            const sources = { ...slide.sources };
            delete sources[slot];
            updateSlide({ sources });
          }}
        >
          근거 연결 해제
        </button>
      )}
    </details>
  );
}
