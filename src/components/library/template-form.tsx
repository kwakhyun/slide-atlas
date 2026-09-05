"use client";

import { useState, type FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { useWorkspace } from "../workspace";
import { Modal } from "../ui";
import { SlideCanvas } from "../slide-canvas";
import {
  INTENTS,
  LAYOUTS,
  THEMES,
  intentLabels,
  layoutLabels,
  themeTokens,
  templateInputSchema,
  type Layout,
  type Intent,
  type TemplateInput,
  type SlideTemplate,
} from "@/lib/domain";
import { SEED_TEMPLATES, layoutSlots } from "@/lib/catalog";

export function TemplateForm({
  template,
  initial,
  onClose,
}: {
  template?: SlideTemplate;
  initial?: TemplateInput;
  onClose: () => void;
}) {
  const { commitTemplate, notify } = useWorkspace();
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
      const saved = await api<SlideTemplate>(
        template ? `/templates/${template.id}` : "/templates",
        {
          method: template ? "PATCH" : "POST",
          body: JSON.stringify(
            template
              ? { template: input, expectedVersion: template.version }
              : input,
          ),
        },
      );
      commitTemplate(saved);
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
