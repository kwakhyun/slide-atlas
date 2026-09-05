"use client";
import { canEdit } from "@/lib/permissions";
import { SemanticSearchPanel } from "./semantic-search-panel";
import { QualityEvaluations } from "./quality-evaluations";
import { ExperimentConfigPanel } from "./experiment-config-panel";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Clock3,
  FlaskConical,
  GitCompareArrows,
  Info,
  Layers3,
  Loader2,
  Play,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { LoadingWorkspace, useWorkspace } from "./workspace";
import { PageHeading } from "./ui";
import { useApiResource } from "./use-api-resource";
import { type Experiment } from "@/lib/domain";
import { EVAL_CASES } from "@/lib/evaluation";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
export function Experiments() {
  const { state, notify } = useWorkspace();
  const [configId, setConfigId] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [allCases, setAllCases] = useState(false);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<
    "all" | "failed" | "improved" | "declined"
  >("all");
  const resource = useApiResource<Experiment[]>(state ? "/experiments" : null);
  const experiments = resource.data ?? [];
  if (!state) return <LoadingWorkspace />;
  const run = experiments.find((e) => e.id === selectedId) ?? experiments[0];
  const baseline =
    experiments.find((experiment) => experiment.id === comparisonId) ??
    experiments.find((experiment) => experiment.id !== run?.id);
  const cases = (run?.results ?? []).filter((item) => {
    if (resultFilter === "failed") return !item.structureHit;
    if (resultFilter === "improved")
      return item.structureHit && !item.lexicalHit;
    if (resultFilter === "declined")
      return !item.structureHit && item.lexicalHit;
    return true;
  });
  const failedIntent = EVAL_CASES.find(
    (item) =>
      item.id === run?.results.find((result) => !result.structureHit)?.id,
  )?.intent;
  async function execute() {
    setBusy(true);
    try {
      const previousRunId = run?.id ?? null;
      const result = await api<Experiment>("/experiments", {
        method: "POST",
        ...(configId ? { body: JSON.stringify({ configId }) } : {}),
      });
      resource.mutate((current) =>
        [
          result,
          ...(current ?? []).filter((item) => item.id !== result.id),
        ].slice(0, 20),
      );
      setSelectedId(result.id);
      setComparisonId(previousRunId);
      notify(`${result.size}개 질의의 검색 비교 실험을 저장했습니다.`);
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  function exportEvidence() {
    if (!run) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `atlas-evaluation-${run.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportCsv() {
    if (!run) return;
    const rows = [
      [
        "id",
        "query",
        "lexical_hit",
        "structure_hit",
        "lexical_rr",
        "structure_rr",
      ],
      ...run.results.map((item) => [
        item.id,
        item.query,
        item.lexicalHit,
        item.structureHit,
        item.lexicalRR,
        item.structureRR,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `atlas-evaluation-${run.id}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="page experiments-page">
      {resource.loading && <p role="status">실험 결과를 불러오는 중입니다.</p>}
      {resource.error && (
        <div role="alert">
          <p>{resource.error}</p>
          <button className="btn" onClick={resource.retry}>
            다시 불러오기
          </button>
        </div>
      )}
      <PageHeading
        eyebrow="EXPERIMENTS"
        title="더 잘 찾는 검색을 만들어 보세요"
        description="같은 질의와 같은 데이터로 비교하고, 다음 개선의 근거를 남기세요."
        actions={
          <button className="btn" disabled={!run} onClick={exportEvidence}>
            <ArrowDownToLine size={15} />
            실험 결과 JSON
          </button>
        }
      />
      <section className="experiment-hero">
        <div>
          <span className="experiment-label">
            <FlaskConical size={14} />
            검색 방식 비교
          </span>
          <h2>
            단어가 같을 때와,
            <br />
            구조가 맞을 때.
          </h2>
          <p>
            단순 키워드 검색에 전달 의도와 슬롯 구조를 더하면
            <br />
            알맞은 템플릿을 더 먼저 찾을 수 있을까요?
          </p>
          <div className="experiment-chips">
            <span>고정 질의 {EVAL_CASES.length}개</span>
            <span>한국어 + 영어</span>
            <span>재현 가능한 비교</span>
          </div>
        </div>
        <div className="experiment-diagram">
          <div className="diagram-input">
            <Search size={15} />
            <span>“이번 분기 매출 성장 지표”</span>
          </div>
          <div className="diagram-branches">
            <div>
              <span className="diagram-letter">A</span>
              <strong>키워드 검색</strong>
              <p>텍스트 일치도</p>
            </div>
            <GitCompareArrows size={23} />
            <div className="enhanced">
              <span className="diagram-letter">B</span>
              <strong>구조 기반 검색</strong>
              <p>의도 + 슬롯 + 용량</p>
            </div>
          </div>
          <div className="diagram-output">
            <BarChart3 size={14} />
            Hit@1 · MRR · 개별 질의 결과
          </div>
        </div>
      </section>
      <div className="experiment-control">
        <div>
          <div className="mini-label">ATLAS-DEV-KO-EN-V1</div>
          <strong>
            {state.templates.filter((t) => t.status === "approved").length}개의
            승인된 템플릿으로 비교합니다.
          </strong>
          <p>
            정답 의도는 검색기에 전달하지 않습니다. 현재 카탈로그 버전을 함께
            기록합니다.
          </p>
        </div>
        <button
          className="btn primary"
          disabled={
            busy || resource.loading || !!resource.error || !canEdit(state.role)
          }
          onClick={() => void execute()}
        >
          {busy ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
          {busy ? "검색 비교 중…" : "비교 실험 실행"}
        </button>
      </div>
      <div className="evaluation-disclosure">
        <Info size={16} />
        <p>
          직접 작성한 개발용 합성 평가셋입니다. 독립 검증셋이나 실제 사용자
          성과가 아니며, 이 결과를 서비스 전체의 검색 품질로 일반화할 수
          없습니다.
        </p>
      </div>
      <div className="metric-cards">
        <MetricCard
          label="HIT@1"
          title="첫 번째 결과가 적합한 비율"
          lexical={run?.lexical.hitAt1}
          structure={run?.structure.hitAt1}
          percentage
        />
        <MetricCard
          label="MRR"
          title="적합한 결과가 나타나는 순서"
          lexical={run?.lexical.mrr}
          structure={run?.structure.mrr}
        />
        <div className="experiment-meta-card">
          <span className="mini-label">RUN METADATA</span>
          <div>
            <Clock3 size={15} />
            <span>검색 연산 시간</span>
            <strong>{run ? `${run.durationMs.toFixed(2)} ms` : "—"}</strong>
          </div>
          <div>
            <Layers3 size={15} />
            <span>평가 질의</span>
            <strong>
              {run ? `${run.size}개` : `${EVAL_CASES.length}개 준비됨`}
            </strong>
          </div>
          {run && (
            <div className="run-hashes">
              <span title={run.datasetHash ?? run.datasetVersion}>
                데이터 {shortHash(run.datasetHash ?? run.datasetVersion)}
              </span>
              <span title={run.catalogHash ?? "이전 실행 기록"}>
                카탈로그 {shortHash(run.catalogHash)}
              </span>
            </div>
          )}
          <p>
            {run
              ? new Date(run.createdAt).toLocaleString("ko-KR")
              : "실험을 실행하면 실제 측정값이 표시됩니다."}
            <br />
            시간은 DB·네트워크 지연을 제외한 서버 내 검색 연산입니다.
          </p>
        </div>
      </div>
      <QualityEvaluations />
      <SemanticSearchPanel />
      <ExperimentConfigPanel
        selected={configId}
        onSelect={setConfigId}
        run={run}
      />
      <section className="evaluation-results">
        <div className="section-title">
          <div>
            <h2>
              <GitCompareArrows size={18} />
              질의별 결과
            </h2>
            <p>잘 찾은 경우와 놓친 경우를 함께 확인하세요.</p>
          </div>
          {experiments.length > 0 && run && (
            <div className="experiment-controls">
              <label className="sr-only" htmlFor="experiment-history">
                실험 기록 선택
              </label>
              <select
                id="experiment-history"
                value={run.id}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {experiments.map((r, i) => (
                  <option key={r.id} value={r.id}>
                    {i === 0 ? "최근 실행" : `이전 실행 ${i}`} ·{" "}
                    {new Date(r.createdAt).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="experiment-baseline">
                비교 기준 실행
              </label>
              <select
                id="experiment-baseline"
                aria-label="비교 기준 실행"
                value={baseline?.id ?? ""}
                disabled={experiments.length < 2}
                onChange={(event) => setComparisonId(event.target.value)}
              >
                {experiments
                  .filter((experiment) => experiment.id !== run.id)
                  .map((experiment, index) => (
                    <option key={experiment.id} value={experiment.id}>
                      비교 {index + 1} · {formatRunTime(experiment.createdAt)}
                    </option>
                  ))}
                {experiments.length < 2 && (
                  <option value="">비교할 실행 없음</option>
                )}
              </select>
              <label className="sr-only" htmlFor="experiment-result-filter">
                결과 필터
              </label>
              <select
                id="experiment-result-filter"
                aria-label="결과 필터"
                value={resultFilter}
                onChange={(event) => {
                  setResultFilter(
                    event.target.value as
                      "all" | "failed" | "improved" | "declined",
                  );
                  setAllCases(false);
                }}
              >
                <option value="all">전체 결과</option>
                <option value="failed">구조 검색 실패</option>
                <option value="improved">개선된 결과</option>
                <option value="declined">하락한 결과</option>
              </select>
              <button className="btn small" onClick={exportCsv}>
                <ArrowDownToLine size={14} />
                CSV
              </button>
            </div>
          )}
        </div>
        {run ? (
          <>
            {baseline && <RunComparison current={run} baseline={baseline} />}
            <div className="table-scroll">
              <table className="results-table">
                <thead>
                  <tr>
                    <th scope="col">검색 질의</th>
                    <th scope="col">A · 키워드 검색</th>
                    <th scope="col">B · 구조 기반 검색</th>
                    <th scope="col">변화</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.length === 0 && (
                    <tr>
                      <td className="no-results-cell" colSpan={4}>
                        선택한 조건에 해당하는 결과가 없습니다.
                      </td>
                    </tr>
                  )}
                  {cases.slice(0, allCases ? cases.length : 8).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.query}</strong>
                        <span>{row.id}</span>
                      </td>
                      <td>
                        <ResultLabel hit={row.lexicalHit} />
                        <span>
                          {state.templates.find(
                            (t) => t.id === row.lexicalIds[0],
                          )?.name ?? "결과 없음"}
                        </span>
                      </td>
                      <td>
                        <ResultLabel hit={row.structureHit} />
                        <span>
                          {state.templates.find(
                            (t) => t.id === row.structureIds[0],
                          )?.name ?? "결과 없음"}
                        </span>
                      </td>
                      <td>
                        {row.structureHit && !row.lexicalHit ? (
                          <span className="delta positive">개선</span>
                        ) : !row.structureHit && row.lexicalHit ? (
                          <span className="delta negative">하락</span>
                        ) : (
                          <span className="delta">동일</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cases.length > 8 && (
              <button
                className="show-all"
                onClick={() => setAllCases(!allCases)}
              >
                {allCases ? "간략히 보기" : `${cases.length}개 질의 모두 보기`}
                <ChevronDown size={14} />
              </button>
            )}
          </>
        ) : (
          <div className="empty-state evaluation-empty">
            <FlaskConical size={30} />
            <h3>아직 실행한 실험이 없어요.</h3>
            <p>비교 실험을 실행하면 실제 결과가 이곳에 표시됩니다.</p>
            <span>준비된 질의 예시</span>
            <div className="example-queries">
              {EVAL_CASES.slice(4, 7).map((c) => (
                <span key={c.id}>{c.query}</span>
              ))}
            </div>
          </div>
        )}
      </section>
      <Link
        className="experiment-next"
        href={
          failedIntent
            ? { pathname: "/library", query: { intent: failedIntent } }
            : "/library"
        }
      >
        <Sparkles size={18} />
        <div>
          <strong>다음 실험은 실패 사례에서 시작합니다.</strong>
          <p>
            놓친 질의의 의도·슬롯을 확인하고, 라이브러리를 수정한 뒤 같은
            평가셋으로 다시 비교하세요.
          </p>
        </div>
        <ArrowRight size={20} />
      </Link>
    </div>
  );
}

function shortHash(value?: string) {
  return value ? value.slice(0, 12) : "기록 없음";
}

function formatRunTime(value: string) {
  return new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function RunComparison({
  current,
  baseline,
}: {
  current: Experiment;
  baseline: Experiment;
}) {
  const datasetMatches =
    (current.datasetHash ?? current.datasetVersion) ===
    (baseline.datasetHash ?? baseline.datasetVersion);
  const catalogMatches =
    Boolean(current.catalogHash) &&
    current.catalogHash === baseline.catalogHash;
  const hitDelta = (current.structure.hitAt1 - baseline.structure.hitAt1) * 100;
  const mrrDelta = current.structure.mrr - baseline.structure.mrr;
  return (
    <div className="run-comparison" aria-label="실험 실행 비교">
      <div>
        <span className="mini-label">RUN COMPARISON</span>
        <strong>
          {formatRunTime(current.createdAt)} 실행과{" "}
          {formatRunTime(baseline.createdAt)}
          실행 비교
        </strong>
      </div>
      <dl>
        <div>
          <dt>구조 Hit@1</dt>
          <dd className={hitDelta >= 0 ? "positive" : "negative"}>
            {hitDelta >= 0 ? "+" : ""}
            {hitDelta.toFixed(1)}pp
          </dd>
        </div>
        <div>
          <dt>구조 MRR</dt>
          <dd className={mrrDelta >= 0 ? "positive" : "negative"}>
            {mrrDelta >= 0 ? "+" : ""}
            {mrrDelta.toFixed(3)}
          </dd>
        </div>
      </dl>
      <div className="comparison-hashes">
        <span
          className={datasetMatches ? "hash-badge match" : "hash-badge changed"}
        >
          평가셋 {datasetMatches ? "동일" : "변경"}
        </span>
        <span
          className={catalogMatches ? "hash-badge match" : "hash-badge changed"}
        >
          카탈로그 {catalogMatches ? "동일" : "변경 또는 미기록"}
        </span>
      </div>
    </div>
  );
}

function ResultLabel({ hit }: { hit: boolean }) {
  return (
    <strong className={`result-label ${hit ? "hit" : "miss"}`}>
      {hit ? <Check size={12} /> : <X size={12} />}
      {hit ? "적합" : "미일치"}
    </strong>
  );
}
function MetricCard({
  label,
  title,
  lexical,
  structure,
  percentage = false,
}: {
  label: string;
  title: string;
  lexical?: number;
  structure?: number;
  percentage?: boolean;
}) {
  const fmt = (v?: number) =>
    v === undefined ? "—" : percentage ? percent(v) : v.toFixed(3);
  return (
    <div className="metric-card">
      <div className="metric-label">
        <span>{label}</span>
        <span>
          {lexical !== undefined && structure !== undefined
            ? `${structure >= lexical ? "+" : ""}${((structure - lexical) * (percentage ? 100 : 1)).toFixed(percentage ? 1 : 3)}${percentage ? "pp" : ""}`
            : "실행 대기"}
        </span>
      </div>
      <h3>{title}</h3>
      <div className="metric-comparison">
        <div>
          <span>A · 키워드</span>
          <strong>{fmt(lexical)}</strong>
        </div>
        <ArrowRight size={19} />
        <div>
          <span>B · 구조 기반</span>
          <strong>{fmt(structure)}</strong>
        </div>
      </div>
      <div className="metric-bars">
        <div style={{ width: `${(lexical ?? 0) * 100}%` }} />
        <div style={{ width: `${(structure ?? 0) * 100}%` }} />
      </div>
    </div>
  );
}
