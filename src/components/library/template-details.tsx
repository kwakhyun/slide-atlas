"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Braces, Copy, FileJson, Pencil } from "lucide-react";
import { useWorkspace } from "../workspace";
import { Modal, StatusBadge } from "../ui";
import { SlideCanvas } from "../slide-canvas";
import { intentLabels, layoutLabels, type SlideTemplate } from "@/lib/domain";

export function TemplateDetails({
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
