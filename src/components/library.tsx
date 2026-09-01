"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Braces,
  Check,
  Copy,
  FileJson,
  Grid2X2,
  Layers3,
  List,
  Loader2,
  Pencil,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { api, LoadingWorkspace, useWorkspace } from "./workspace";
import { PageHeading, Modal, StatusBadge } from "./ui";
import { SlideCanvas } from "./slide-canvas";
import {
  INTENTS,
  LAYOUTS,
  STATUSES,
  THEMES,
  intentLabels,
  layoutLabels,
  statusLabels,
  themeTokens,
  templateInputSchema,
  type Intent,
  type Layout,
  type TemplateInput,
  type SlideTemplate,
  type SearchMatch,
  type TemplateStatus,
} from "@/lib/domain";
import { SEED_TEMPLATES, layoutSlots } from "@/lib/catalog";

export function Library({ initialIntent }: { initialIntent?: Intent }) {
  const { state, notify } = useWorkspace();
  const [q, setQ] = useState("");
  const [intent, setIntent] = useState<Intent | "">(initialIntent ?? "");
  const [status, setStatus] = useState<TemplateStatus | "">("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"relevance" | "updated" | "name">(
    initialIntent ? "relevance" : "updated",
  );
  const [matches, setMatches] = useState<SearchMatch[] | null>(null);
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
        const params = new URLSearchParams({ q, strategy: "structure" });
        if (intent) params.set("intent", intent);
        if (status) params.set("status", status);
        const result = await api<SearchMatch[]>(`/templates?${params}`, {
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
  }, [q, intent, status, state, notify]);
  if (!state) return <LoadingWorkspace />;
  const filtered = (
    matches ??
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
        eyebrow="A LIBRARY WITH INTENT"
        title="좋은 디자인의 구조를 모으다."
        description="예쁜 이미지를 넘어, AI가 이해하고 다시 사용할 수 있는 디자인 데이터."
        actions={
          <>
            <button className="btn" onClick={() => setImportOpen(true)}>
              <Upload size={15} />
              JSON 가져오기
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
            사용 가능한 구조
            <strong>
              {approved}
              <small>승인 완료</small>
            </strong>
          </span>
        </div>
        <div>
          <Grid2X2 size={20} />
          <span>
            전달 의도
            <strong>
              {INTENTS.length}
              <small>의도 유형</small>
            </strong>
          </span>
        </div>
        <div className="library-overview-note">
          <span>BUILT FOR REUSE</span>
          <p>
            의도 → 레이아웃 → 슬롯 → 제약 조건
            <br />
            하나의 구조, 다양한 이야기.
          </p>
          <Braces size={34} />
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
            onChange={(e) => setQ(e.target.value)}
            placeholder="전하고 싶은 내용으로 검색하세요. 예: 분기 매출 성장 지표"
          />
          {q && (
            <button
              className="icon-btn"
              aria-label="검색어 지우기"
              onClick={() => setQ("")}
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
            onChange={(e) => setStatus(e.target.value as TemplateStatus | "")}
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
            onChange={(event) => setSort(event.target.value as typeof sort)}
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
          onClick={() => setIntent("")}
        >
          전체 <span>{state.templates.length}</span>
        </button>
        {INTENTS.map((type) => (
          <button
            key={type}
            className={intent === type ? "active" : ""}
            aria-pressed={intent === type}
            onClick={() => setIntent(type)}
          >
            {intentLabels[type]}
            <span>
              {state.templates.filter((t) => t.intent === type).length}
            </span>
          </button>
        ))}
      </div>
      <div className="results-heading">
        <span>
          {searching ? (
            <>
              <Loader2 className="spin" size={12} />
              구조를 찾고 있어요
            </>
          ) : (
            <>{filtered.length}개의 템플릿</>
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
        <ImportTemplate
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

function TemplateDetails({
  template: t,
  onClose,
  onEdit,
  onCopy,
}: {
  template: SlideTemplate;
  onClose: () => void;
  onEdit: () => void;
  onCopy: () => void;
}) {
  const [tab, setTab] = useState<"schema" | "json">("schema");
  const [guides, setGuides] = useState(true);
  const { notify } = useWorkspace();
  const densityLabel =
    t.density === "low" ? "낮음" : t.density === "high" ? "높음" : "보통";
  return (
    <Modal
      title={t.name}
      subtitle="디자인을 이미지가 아닌 의미와 제약 조건으로 이해합니다."
      onClose={onClose}
      wide
    >
      <div className="template-detail">
        <div className="detail-preview">
          <SlideCanvas
            template={t}
            slide={{
              id: t.id,
              templateId: t.id,
              templateVersion: t.version,
              values: t.sampleContent,
              theme: t.defaultTheme,
            }}
            showSlots={guides}
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={guides}
              onChange={(e) => setGuides(e.target.checked)}
            />
            슬롯 영역 표시
          </label>
          <p>{t.description}</p>
          <div className="detail-properties">
            <div>
              <span>전달 의도</span>
              <strong>{intentLabels[t.intent]}</strong>
            </div>
            <div>
              <span>레이아웃</span>
              <strong>{layoutLabels[t.layout]}</strong>
            </div>
            <div>
              <span>정보 밀도</span>
              <strong>{densityLabel}</strong>
            </div>
            <div>
              <span>버전·상태</span>
              <strong>
                v{t.version} <StatusBadge status={t.status} />
              </strong>
            </div>
          </div>
        </div>
        <div className="ontology-panel">
          <div className="panel-tabs">
            <button
              className={tab === "schema" ? "active" : ""}
              onClick={() => setTab("schema")}
            >
              <Braces size={15} />
              온톨로지
            </button>
            <button
              className={tab === "json" ? "active" : ""}
              onClick={() => setTab("json")}
            >
              <FileJson size={15} />
              원본 JSON
            </button>
          </div>
          {tab === "schema" ? (
            <div className="slot-table">
              <div className="slot-table-head">
                <span>슬롯 / 역할</span>
                <span>글자 수</span>
              </div>
              {t.slots.map((s) => (
                <div className="slot-table-row" key={s.key}>
                  <div>
                    <strong>
                      {s.key}
                      {s.required && <i>*</i>}
                    </strong>
                    <span>
                      {s.label} · {s.role}
                    </span>
                  </div>
                  <span>{s.maxChars}자</span>
                </div>
              ))}
              <p className="field-hint">
                * 필수 슬롯 · 좌표는 캔버스 대비 0–1 값으로 정규화됩니다.
              </p>
            </div>
          ) : (
            <div className="json-inspector">
              <button
                className="btn small"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      JSON.stringify(t, null, 2),
                    );
                    notify("온톨로지 JSON을 복사했습니다.");
                  } catch {
                    notify("브라우저에서 클립보드 접근을 허용해 주세요.", true);
                  }
                }}
              >
                <Copy size={13} />
                복사
              </button>
              <pre>{JSON.stringify(t, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
      <div className="modal-actions">
        <span className="modal-action-note">수정 시 재검수가 필요합니다.</span>
        {t.status === "approved" && (
          <Link className="btn green" href={`/studio?template=${t.id}`}>
            <ArrowRight size={14} />이 템플릿으로 만들기
          </Link>
        )}
        <button className="btn" onClick={onCopy}>
          <Copy size={14} />
          복제하여 등록
        </button>
        <button className="btn dark" onClick={onEdit}>
          <Pencil size={14} />
          템플릿 수정
        </button>
      </div>
    </Modal>
  );
}

export function TemplateForm({
  template,
  initial,
  onClose,
}: {
  template?: SlideTemplate;
  initial?: TemplateInput;
  onClose: () => void;
}) {
  const { refresh, notify } = useWorkspace();
  const [value, setValue] = useState<TemplateInput>(() => ({
    ...(template ??
      initial ?? {
        ...SEED_TEMPLATES[0],
        name: "",
        description: "",
        tags: ["프레젠테이션"],
      }),
  }));
  const [tags, setTags] = useState(value.tags.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function changeLayout(layout: Layout) {
    const sample = SEED_TEMPLATES.find((t) => t.layout === layout)!;
    setValue((v) => ({
      ...v,
      layout,
      intent: sample.intent,
      slots: layoutSlots[layout].map((s) => ({ ...s })),
      sampleContent: { ...sample.sampleContent },
    }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const input = templateInputSchema.parse({
        ...value,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      await api(template ? `/templates/${template.id}` : "/templates", {
        method: template ? "PATCH" : "POST",
        body: JSON.stringify(
          template
            ? { template: input, expectedVersion: template.version }
            : input,
        ),
      });
      await refresh();
      notify(
        template
          ? "템플릿을 수정했습니다. 초안 상태에서 다시 검수해 주세요."
          : "새 템플릿을 초안으로 등록했습니다.",
      );
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={template ? "템플릿 수정" : "새로운 구조 등록"}
      subtitle="의도와 슬롯을 정의해 재사용 가능한 디자인 데이터로 만드세요."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="template-form">
          <div>
            <div className="form-field">
              <label className="field-label" htmlFor="template-name">
                템플릿 이름 *
              </label>
              <input
                id="template-name"
                value={value.name}
                onChange={(e) =>
                  setValue((v) => ({ ...v, name: e.target.value }))
                }
                required
                minLength={2}
                maxLength={80}
                placeholder="예: 고객 여정을 설명하는 세 단계"
              />
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="template-description">
                사용 목적 *
              </label>
              <textarea
                id="template-description"
                rows={3}
                value={value.description}
                onChange={(e) =>
                  setValue((v) => ({ ...v, description: e.target.value }))
                }
                required
                minLength={5}
                maxLength={400}
                placeholder="어떤 내용을 전달할 때 이 구조가 적합한가요?"
              />
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label className="field-label" htmlFor="template-layout">
                  레이아웃
                </label>
                <select
                  id="template-layout"
                  value={value.layout}
                  onChange={(e) => changeLayout(e.target.value as Layout)}
                >
                  {LAYOUTS.map((l) => (
                    <option key={l} value={l}>
                      {layoutLabels[l]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="field-label" htmlFor="template-intent">
                  전달 의도
                </label>
                <select
                  id="template-intent"
                  value={value.intent}
                  onChange={(e) =>
                    setValue((v) => ({
                      ...v,
                      intent: e.target.value as Intent,
                    }))
                  }
                >
                  {INTENTS.map((i) => (
                    <option key={i} value={i}>
                      {intentLabels[i]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="field-label" htmlFor="template-theme">
                  기본 스타일
                </label>
                <select
                  id="template-theme"
                  value={value.defaultTheme}
                  onChange={(e) =>
                    setValue((v) => ({
                      ...v,
                      defaultTheme: e.target
                        .value as TemplateInput["defaultTheme"],
                    }))
                  }
                >
                  {THEMES.map((t) => (
                    <option key={t} value={t}>
                      {themeTokens[t].name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="field-label" htmlFor="template-density">
                  정보 밀도
                </label>
                <select
                  id="template-density"
                  value={value.density}
                  onChange={(e) =>
                    setValue((v) => ({
                      ...v,
                      density: e.target.value as TemplateInput["density"],
                    }))
                  }
                >
                  <option value="low">낮음</option>
                  <option value="medium">중간</option>
                  <option value="high">높음</option>
                </select>
              </div>
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="template-tags">
                태그 · 쉼표로 구분
              </label>
              <input
                id="template-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                required
                maxLength={250}
              />
            </div>
            <div className="form-preview">
              <SlideCanvas
                template={{
                  ...value,
                  id: "preview",
                  version: 1,
                  status: "draft",
                  updatedAt: "",
                }}
                slide={{
                  id: "preview",
                  templateId: "preview",
                  templateVersion: 1,
                  theme: value.defaultTheme,
                  values: value.sampleContent,
                }}
              />
            </div>
          </div>
          <div className="slot-editor">
            <div className="section-label">
              <span>CONTENT SLOTS</span>
              <span>{value.slots.length}개 슬롯</span>
            </div>
            {value.slots.map((slot, index) => (
              <div className="slot-editor-item" key={slot.key}>
                <div>
                  <strong>
                    {slot.label} <code>{slot.key}</code>
                  </strong>
                  <label>
                    최대{" "}
                    <input
                      aria-label={`${slot.label} 최대 글자 수`}
                      type="number"
                      min={4}
                      max={500}
                      value={slot.maxChars}
                      onChange={(e) =>
                        setValue((v) => ({
                          ...v,
                          slots: v.slots.map((s, i) =>
                            i === index
                              ? { ...s, maxChars: +e.target.value }
                              : s,
                          ),
                        }))
                      }
                    />
                    자
                  </label>
                </div>
                <label className="sr-only" htmlFor={`sample-${slot.key}`}>
                  {slot.label} 예시
                </label>
                <textarea
                  id={`sample-${slot.key}`}
                  rows={2}
                  value={value.sampleContent[slot.key] ?? ""}
                  maxLength={500}
                  required={slot.required}
                  onChange={(e) =>
                    setValue((v) => ({
                      ...v,
                      sampleContent: {
                        ...v.sampleContent,
                        [slot.key]: e.target.value,
                      },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <span className="modal-action-note">
            승인 전에는 생성에 사용되지 않습니다.
          </span>
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <Check size={15} />
            )}
            초안 저장
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ImportTemplate({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (value: TemplateInput) => void;
}) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal
      title="구조 데이터 가져오기"
      subtitle="온톨로지 스키마를 검사한 뒤 초안으로 등록합니다."
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="field-label">
          <label htmlFor="import-json">템플릿 JSON</label>
          <button
            className="text-btn"
            onClick={() =>
              setRaw(
                JSON.stringify(
                  templateInputSchema.parse(SEED_TEMPLATES[0]),
                  null,
                  2,
                ),
              )
            }
          >
            예시 JSON 넣기
          </button>
        </div>
        <textarea
          id="import-json"
          className="json-input"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          maxLength={30000}
          rows={13}
          placeholder={'{ "name": "템플릿 이름", "intent": "overview", ... }'}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="field-hint">
          슬롯 중복, 필수 제목, 캔버스 범위, 예시 글자 제한을 검사합니다. 외부
          파일이나 코드가 실행되지 않습니다.
        </p>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          취소
        </button>
        <button
          className="btn primary"
          disabled={!raw.trim()}
          onClick={() => {
            try {
              onImport(templateInputSchema.parse(JSON.parse(raw)));
            } catch (e) {
              setError(
                e instanceof SyntaxError
                  ? "JSON 문법을 확인해 주세요."
                  : (e as Error).message,
              );
            }
          }}
        >
          <FileJson size={15} />
          검사 후 계속
        </button>
      </div>
    </Modal>
  );
}
