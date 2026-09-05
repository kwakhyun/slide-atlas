"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { canEdit } from "@/lib/permissions";
import type { semanticSearch } from "@/server/semantic-search";
import { useWorkspace } from "./workspace-state";
import { useApiResource } from "./use-api-resource";
type Run = Awaited<ReturnType<typeof semanticSearch>> & {
  relevantIds: string[];
  judgments: Record<
    "lexical" | "structure" | "hybrid",
    { hitAt1: boolean; rrAt5: number }
  > | null;
};
export function SemanticSearchPanel() {
  const { state, notify } = useWorkspace();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [code, setCode] = useState(""),
    [slots, setSlots] = useState(""),
    [relevant, setRelevant] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState("");
  const resource = useApiResource<Run[]>(
      state && open ? "/semantic-search" : null,
    ),
    run = resource.data?.find((r) => r.id === selected) ?? resource.data?.[0];
  async function execute() {
    setBusy(true);
    try {
      const result = await api<Run>("/semantic-search", {
        method: "POST",
        headers: { "x-ai-access-code": code },
        body: JSON.stringify({
          query,
          slots: slots === "" ? undefined : Number(slots),
          relevantIds: relevant,
        }),
      });
      resource.mutate((rows) => [result, ...(rows ?? [])]);
      setSelected(result.id);
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
      <summary>의미 검색과 기존 검색 비교</summary>
      <p>
        키워드, 구조, 임베딩과 구조를 결합한 검색을 같은 승인 템플릿에서
        비교합니다. 검색어와 템플릿 설명이 OpenAI로 전송됩니다. 새 임베딩에
        비용이 발생하며 캐시를 재사용합니다.
      </p>
      <label>
        비교할 검색어
        <input
          value={query}
          maxLength={1000}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label>
        필요한 내용 슬롯 수 (선택)
        <input
          type="number"
          min={0}
          max={12}
          value={slots}
          onChange={(e) => setSlots(e.target.value)}
        />
      </label>
      <label>
        AI 실험 초대 코드
        <input
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <details>
        <summary>정답 템플릿 지정 (선택)</summary>
        <p>
          판정용 정답은 순위 계산에 전달하지 않습니다. 직접 고른 질의는 독립
          평가로 표시하지 않습니다.
        </p>
        {state?.templates
          .filter((t) => t.status === "approved")
          .map((t) => (
            <label key={t.id}>
              <input
                type="checkbox"
                checked={relevant.includes(t.id)}
                onChange={(e) =>
                  setRelevant((ids) =>
                    e.target.checked
                      ? [...ids, t.id]
                      : ids.filter((id) => id !== t.id),
                  )
                }
              />
              {t.name}
            </label>
          ))}
      </details>
      <button
        className="btn primary"
        disabled={
          busy ||
          !state?.aiAvailable ||
          !canEdit(state?.role) ||
          query.trim().length < 2 ||
          !code ||
          relevant.length > 10
        }
        onClick={() => void execute()}
      >
        {busy ? "검색 비교 중" : "의미 검색 비교 실행"}
      </button>
      {!state?.aiAvailable && (
        <p>
          AI가 연결된 환경에서 실행할 수 있습니다. 기본 검색 실험은 그대로
          사용할 수 있습니다.
        </p>
      )}
      {resource.error && (
        <p role="alert">
          {resource.error}
          <button className="btn" onClick={resource.retry}>
            다시 불러오기
          </button>
        </p>
      )}
      <label>
        보관한 비교
        <select
          value={run?.id ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">비교 기록 선택</option>
          {resource.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.query} · {new Date(r.createdAt).toLocaleString("ko-KR")}
            </option>
          ))}
        </select>
      </label>
      {run && (
        <>
          <p>
            {run.model} · 새 API 호출 {run.usage.apiCalls}회 · 입력{" "}
            {run.usage.inputTokens}토큰 · 전체 {run.timing.totalMs.toFixed(0)}ms
          </p>
          <p>
            키워드 연산 {run.timing.lexicalMs.toFixed(2)}ms, 구조 연산{" "}
            {run.timing.structureMs.toFixed(2)}ms. 전체 시간에는 캐시와 모델
            응답이 포함됩니다. 금액은 운영 계정의 과금 조건을 따릅니다.
          </p>
          <div className="search-comparison">
            {(["lexical", "structure", "hybrid"] as const).map((key) => (
              <section key={key}>
                <h4>
                  {
                    {
                      lexical: "키워드 검색",
                      structure: "구조 검색",
                      hybrid: "의미 + 구조 검색",
                    }[key]
                  }
                </h4>
                {run.judgments && (
                  <p>
                    첫 결과 정답: {run.judgments[key].hitAt1 ? "예" : "아니요"}{" "}
                    · RR@5 {run.judgments[key].rrAt5.toFixed(2)}
                  </p>
                )}
                <ol>
                  {run[key].map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/studio?template=${encodeURIComponent(r.id)}`}
                      >
                        {r.name}
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
