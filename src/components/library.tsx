"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Braces,
  BarChart3,
  Lightbulb,
  MessageSquareText,
  GitCompareArrows,
  Workflow,
  CalendarRange,
  Check,
  Grid2X2,
  Layers3,
  List,
  Loader2,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { LoadingWorkspace, useWorkspace } from "./workspace";
import { PageHeading, StatusBadge } from "./ui";
import { SlideCanvas } from "./slide-canvas";
import { TemplateDetails } from "./library/template-details";
import { TemplateForm } from "./library/template-form";
import { TemplateImportModal } from "./library/template-import";
import {
  INTENTS,
  STATUSES,
  intentLabels,
  layoutLabels,
  statusLabels,
  type Intent,
  type TemplateInput,
  type SlideTemplate,
  type SearchPage,
  type TemplateStatus,
} from "@/lib/domain";

export function Library({ initialIntent }: { initialIntent?: Intent }) {
  const { state, notify } = useWorkspace();
  const [q, setQ] = useState("");
  const [intent, setIntent] = useState<Intent | "">(initialIntent ?? "");
  const [status, setStatus] = useState<TemplateStatus | "">("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"relevance" | "updated" | "name">(
    initialIntent ? "relevance" : "updated",
  );
  const [matches, setMatches] = useState<SearchPage | null>(null);
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    template?: SlideTemplate;
    initial?: TemplateInput;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => {
    if (!state) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({
          q,
          strategy: "structure",
          sort,
          page: String(page),
          pageSize: "12",
        });
        if (intent) params.set("intent", intent);
        if (status) params.set("status", status);
        const result = await api<SearchPage>(`/templates?${params}`, {
          signal: controller.signal,
        });
        setMatches(result);
      } catch (error) {
        if (!controller.signal.aborted) notify((error as Error).message, true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, intent, status, sort, page, state, notify]);
  if (!state) return <LoadingWorkspace />;
  const filtered = (
    matches?.items ??
    state.templates.map((template) => ({
      template,
      score: 0,
      reasons: [],
      breakdown: { lexical: 0, intent: 0, structure: 0, capacity: 0 },
    }))
  )
    .filter((m) => !intent || m.template.intent === intent)
    .slice()
    .sort((a, b) => {
      if (sort === "name")
        return a.template.name.localeCompare(b.template.name, "ko");
      if (sort === "updated")
        return b.template.updatedAt.localeCompare(a.template.updatedAt);
      return b.score - a.score || a.template.id.localeCompare(b.template.id);
    });
  const selected = state.templates.find((t) => t.id === selectedId);
  const approved = state.templates.filter(
    (t) => t.status === "approved",
  ).length;
  return (
    <div className="page library-page">
      <PageHeading
        eyebrow="TEMPLATES"
        title="어떤 슬라이드를 만들까요?"
        description="이야기에 맞는 템플릿을 찾고, 나만의 내용으로 완성해 보세요."
        actions={
          <>
            <button className="btn" onClick={() => setImportOpen(true)}>
              <Upload size={15} />
              파일 가져오기
            </button>
            <button className="btn dark" onClick={() => setEditing({})}>
              <Plus size={16} />
              템플릿 등록
            </button>
          </>
        }
      />
      <div className="library-overview">
        <div>
          <Layers3 size={21} />
          <span>
            전체 템플릿<strong>{state.templates.length}</strong>
          </span>
        </div>
        <div>
          <Check size={20} />
          <span>
            바로 쓸 수 있는 템플릿
            <strong>
              {approved}
              <small>승인 완료</small>
            </strong>
          </span>
        </div>
        <div>
          <Grid2X2 size={20} />
          <span>
            디자인 카테고리
            <strong>
              {INTENTS.length}
              <small>카테고리</small>
            </strong>
          </span>
        </div>
      </div>
      <div className="library-filters">
        <div className="search-field">
          <Search size={17} />
          <label className="sr-only" htmlFor="template-query">
            템플릿 검색
          </label>
          <input
            id="template-query"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="전하고 싶은 내용으로 검색하세요. 예: 분기 매출 성장 지표"
          />
          {q && (
            <button
              className="icon-btn"
              aria-label="검색어 지우기"
              onClick={() => {
                setQ("");
                setPage(1);
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="status-filter">
          <SlidersHorizontal size={15} />
          <label className="sr-only" htmlFor="status-filter">
            검수 상태
          </label>
          <select
            id="status-filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TemplateStatus | "");
              setPage(1);
            }}
          >
            <option value="">모든 상태</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="status-filter">
          <label className="sr-only" htmlFor="sort-filter">
            정렬 기준
          </label>
          <select
            id="sort-filter"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as typeof sort);
              setPage(1);
            }}
          >
            <option value="relevance">관련도순</option>
            <option value="updated">최근 수정순</option>
            <option value="name">이름순</option>
          </select>
        </div>
        <div className="view-toggle">
          <button
            aria-label="그리드 보기"
            aria-pressed={view === "grid"}
            className={view === "grid" ? "active" : ""}
            onClick={() => setView("grid")}
          >
            <Grid2X2 size={16} />
          </button>
          <button
            aria-label="목록 보기"
            aria-pressed={view === "list"}
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            <List size={17} />
          </button>
        </div>
      </div>
      <div className="intent-tabs" aria-label="전달 의도 필터">
        <button
          className={!intent ? "active" : ""}
          aria-pressed={!intent}
          onClick={() => {
            setIntent("");
            setPage(1);
          }}
        >
          <Grid2X2 size={23} />
          전체 <span>{state.templates.length}</span>
        </button>
        {INTENTS.map((type, index) => {
          const Icon = [
            MessageSquareText,
            GitCompareArrows,
            BarChart3,
            Workflow,
            CalendarRange,
            Lightbulb,
          ][index];
          return (
            <button
              key={type}
              className={intent === type ? "active" : ""}
              aria-pressed={intent === type}
              onClick={() => {
                setIntent(type);
                setPage(1);
              }}
            >
              <Icon size={23} />
              {intentLabels[type]}
              <span>
                {state.templates.filter((t) => t.intent === type).length}
              </span>
            </button>
          );
        })}
      </div>
      <div className="results-heading">
        <span>
          {searching ? (
            <>
              <Loader2 className="spin" size={12} />
              구조를 찾고 있어요
            </>
          ) : (
            <>{matches?.total ?? filtered.length}개의 템플릿</>
          )}
        </span>
        <span>
          {q
            ? "키워드 + 의도 + 슬롯 + 용량을 함께 평가합니다"
            : "직접 제작한 오리지널 템플릿 · 16:9"}
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">
          <SearchX size={34} />
          <h2>이 조건에 맞는 구조가 없어요.</h2>
          <p>다른 단어나 전달 의도로 다시 찾아보세요.</p>
          <button
            className="btn"
            onClick={() => {
              setQ("");
              setIntent("");
              setStatus("");
              setPage(1);
            }}
          >
            필터 초기화
          </button>
        </div>
      ) : (
        <div
          className={view === "grid" ? "template-grid" : "template-list"}
          aria-busy={searching}
        >
          {filtered.map(({ template: t, score, reasons, breakdown }) => (
            <button
              key={t.id}
              className="template-card"
              onClick={() => setSelectedId(t.id)}
              aria-label={`${t.name} 상세 보기`}
            >
              <div className="template-preview">
                <SlideCanvas
                  template={t}
                  slide={{
                    id: t.id,
                    templateId: t.id,
                    templateVersion: t.version,
                    values: t.sampleContent,
                    theme: t.defaultTheme,
                  }}
                />
                <div className="template-preview-top">
                  <span>{layoutLabels[t.layout]}</span>
                  {q && (
                    <span
                      className="match-score"
                      title={`키워드 ${breakdown.lexical} · 의도 ${breakdown.intent} · 구조 ${breakdown.structure} · 용량 ${breakdown.capacity}`}
                    >
                      관련도 {score}
                    </span>
                  )}
                </div>
                <span className="preview-open">
                  <ArrowRight size={16} />
                </span>
              </div>
              <div className="template-info">
                <div className="template-name">
                  <h2>{t.name}</h2>
                  <StatusBadge status={t.status} />
                </div>
                <p>
                  {intentLabels[t.intent]}
                  <span>·</span>
                  슬롯 {t.slots.length}개<span>·</span>v{t.version}
                </p>
                <div className="template-tags">
                  {t.tags.slice(0, 3).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                {q && (
                  <div className="match-reasons">
                    {reasons.slice(0, 2).join(" · ") || "텍스트 유사도 비교"}
                    <span>
                      키워드 {breakdown.lexical} · 의도 {breakdown.intent} ·
                      구조 {breakdown.structure} · 용량 {breakdown.capacity}
                    </span>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      {matches && matches.total > matches.pageSize && (
        <nav className="library-pagination" aria-label="템플릿 검색 페이지">
          <button
            className="btn small"
            disabled={matches.page === 1 || searching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            이전
          </button>
          <span>
            {matches.page} / {Math.ceil(matches.total / matches.pageSize)}
          </span>
          <button
            className="btn small"
            disabled={!matches.hasNext || searching}
            onClick={() => setPage((current) => current + 1)}
          >
            다음
          </button>
        </nav>
      )}
      <div className="library-footnote">
        <Braces size={14} />
        <span>
          모든 템플릿은 구조화된 JSON으로 관리되며, 수정하면 초안 상태로
          돌아갑니다.
        </span>
      </div>
      {selected && (
        <TemplateDetails
          template={selected}
          onClose={() => setSelectedId(null)}
          onEdit={() => {
            setEditing({ template: selected });
            setSelectedId(null);
          }}
          onCopy={() => {
            setEditing({
              initial: { ...selected, name: `${selected.name} 복사본` },
            });
            setSelectedId(null);
          }}
        />
      )}
      {editing && (
        <TemplateForm
          template={editing.template}
          initial={editing.initial}
          onClose={() => setEditing(null)}
        />
      )}
      {importOpen && (
        <TemplateImportModal
          onClose={() => setImportOpen(false)}
          onImport={(input) => {
            setImportOpen(false);
            setEditing({ initial: input });
          }}
        />
      )}
    </div>
  );
}
