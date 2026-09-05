"use client";

import { ExtractionCorrection } from "./extraction-correction";
import { BatchImport } from "./batch-import";
import { useState, useRef, useEffect } from "react";
import {
  ArrowRight,
  Check,
  FileJson,
  FileType2,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { Modal } from "../ui";
import { SlideCanvas } from "../slide-canvas";
import {
  layoutLabels,
  templateInputSchema,
  type PptxExtractionResult,
  type TemplateInput,
} from "@/lib/domain";
import { SEED_TEMPLATES } from "@/lib/catalog";

export function TemplateImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (value: TemplateInput) => void;
}) {
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const [tab, setTab] = useState<"pptx" | "json">("pptx");
  const [raw, setRaw] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PptxExtractionResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function analyzePptx() {
    if (!file) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      if (file.size > 8 * 1024 * 1024)
        throw new Error("PowerPoint 파일은 8MB 이하여야 합니다.");
      const form = new FormData();
      form.append("file", file);
      const extraction = await api<PptxExtractionResult>("/templates/extract", {
        method: "POST",
        body: form,
        signal: request.signal,
      });
      if (request.signal.aborted) return;
      setResult(extraction);
      setSelected(0);
    } catch (error) {
      setError(
        request.signal.aborted
          ? "분석을 취소했습니다. 파일을 다시 선택하거나 재시도할 수 있습니다."
          : error instanceof Error
            ? error.message
            : "PowerPoint 분석 중 문제가 발생했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="템플릿 초안 가져오기"
      subtitle="PowerPoint 구조를 추출하거나 표준 JSON을 검증한 뒤 기존 등록 폼에서 보완합니다."
      onClose={onClose}
      wide
    >
      <div
        className="panel-tabs import-tabs"
        role="tablist"
        aria-label="가져오기 방식"
      >
        <button
          role="tab"
          aria-selected={tab === "pptx"}
          className={tab === "pptx" ? "active" : ""}
          onClick={() => {
            setTab("pptx");
            setError("");
          }}
        >
          <FileType2 size={15} />
          PowerPoint 구조 추출
        </button>
        <button
          role="tab"
          aria-selected={tab === "json"}
          className={tab === "json" ? "active" : ""}
          onClick={() => {
            setTab("json");
            setError("");
          }}
        >
          <FileJson size={15} />
          표준 JSON
        </button>
      </div>

      {tab === "pptx" ? (
        <div className="modal-body import-body">
          <div className="pptx-upload">
            <label htmlFor="pptx-file">
              <FileType2 size={24} />
              <span>
                <strong>
                  {file ? file.name : ".pptx 파일을 선택해 주세요"}
                </strong>
                <small>
                  텍스트·좌표·글자 크기를 읽고 최대 12개 슬라이드를 온톨로지
                  후보로 변환합니다.
                </small>
              </span>
            </label>
            <input
              id="pptx-file"
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setResult(null);
                setError("");
              }}
            />
            <button
              className="btn dark"
              disabled={!file || busy}
              onClick={() => void analyzePptx()}
            >
              {busy ? (
                <Loader2 className="spin" size={15} />
              ) : (
                <ArrowRight size={15} />
              )}
              {busy ? "구조 분석 중" : "구조 분석"}
            </button>
            {busy && (
              <button
                className="btn"
                onClick={() => controller.current?.abort()}
              >
                분석 취소
              </button>
            )}
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {result && (
            <div className="extraction-result">
              <div className="extraction-summary">
                <div>
                  <span className="mini-label">EXTRACTION SUMMARY</span>
                  <strong>
                    전체 {result.slideCount}장 중 후보{" "}
                    {result.candidates.length}개
                  </strong>
                </div>
                <span>분석 {result.analyzedSlides}장 · 저장 전 검토 필수</span>
              </div>
              {result.warnings.map((warning) => (
                <p className="extraction-warning" key={warning}>
                  <TriangleAlert size={13} />
                  {warning}
                </p>
              ))}
              <BatchImport
                key={
                  result.fileName +
                  result.candidates.map((c) => c.template.name).join()
                }
                result={result}
              />
              <div
                className="extraction-candidates"
                role="radiogroup"
                aria-label="추출 후보"
              >
                {result.candidates.map((candidate, index) => (
                  <button
                    key={candidate.slideNumber}
                    type="button"
                    role="radio"
                    aria-checked={selected === index}
                    className={selected === index ? "selected" : ""}
                    onClick={() => setSelected(index)}
                  >
                    <div className="extraction-preview">
                      <SlideCanvas
                        template={{
                          ...candidate.template,
                          id: `extract-${candidate.slideNumber}`,
                          version: 1,
                          status: "draft",
                          updatedAt: "",
                        }}
                        slide={{
                          id: `extract-${candidate.slideNumber}`,
                          templateId: `extract-${candidate.slideNumber}`,
                          templateVersion: 1,
                          theme: candidate.template.defaultTheme,
                          values: candidate.template.sampleContent,
                        }}
                        showSlots
                      />
                    </div>
                    <div className="extraction-meta">
                      <span>
                        슬라이드 {candidate.slideNumber}
                        {selected === index && <Check size={13} />}
                      </span>
                      <strong>{candidate.template.name}</strong>
                      <small>
                        {layoutLabels[candidate.template.layout]} · 슬롯{" "}
                        {candidate.template.slots.length}개 · 추론 점수{" "}
                        {Math.round(candidate.confidence * 100)}%
                      </small>
                      <div>
                        {candidate.signals.map((signal) => (
                          <i key={signal}>{signal}</i>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {result.candidates[selected] && (
                <ExtractionCorrection
                  key={selected}
                  candidate={result.candidates[selected]}
                  onChange={(template) =>
                    setResult(
                      (current) =>
                        current && {
                          ...current,
                          candidates: current.candidates.map(
                            (candidate, index) =>
                              index === selected
                                ? { ...candidate, template }
                                : candidate,
                          ),
                        },
                    )
                  }
                />
              )}
              {result.candidates[selected]?.warnings.map((warning) => (
                <p className="field-hint" key={warning}>
                  {warning}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="modal-body import-body">
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
            onChange={(event) => setRaw(event.target.value)}
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
            슬롯 중복, 필수 제목, 캔버스 좌표와 예시 길이를 검증합니다. 외부
            링크나 코드는 실행하지 않습니다.
          </p>
        </div>
      )}

      <div className="modal-actions">
        <span className="modal-action-note">
          가져온 결과는 바로 저장되지 않으며 등록 폼에서 수정할 수 있습니다.
        </span>
        <button className="btn" onClick={onClose}>
          취소
        </button>
        <button
          className="btn primary"
          disabled={
            tab === "pptx" ? !result?.candidates[selected] : !raw.trim()
          }
          onClick={() => {
            try {
              const value =
                tab === "pptx"
                  ? result?.candidates[selected]?.template
                  : templateInputSchema.parse(JSON.parse(raw));
              if (value) onImport(value);
            } catch (error) {
              setError(
                error instanceof SyntaxError
                  ? "JSON 형식을 확인해 주세요."
                  : error instanceof Error
                    ? error.message
                    : "가져오기 결과를 확인해 주세요.",
              );
            }
          }}
        >
          <Check size={15} />
          선택한 초안 검토
        </button>
      </div>
    </Modal>
  );
}
