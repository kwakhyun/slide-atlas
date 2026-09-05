"use client";
import { useState } from "react";
import { themeTokens, type Brand, type Slide } from "@/lib/domain";
import { api } from "@/lib/api-client";
import { useWorkspace } from "../workspace-state";
import { useApiResource } from "../use-api-resource";
export function BrandPanel({
  slide,
  busy,
  onApply,
}: {
  slide: Slide;
  busy: boolean;
  onApply: (brand: Brand | undefined) => void;
}) {
  const { state, notify } = useWorkspace();
  const [open, setOpen] = useState(false);
  const brands = useApiResource<Brand[]>(state && open ? "/brands" : null);
  const [editing, setEditing] = useState<Brand | undefined>();
  const [name, setName] = useState("새 브랜드");
  const [font, setFont] = useState<Brand["font"]>("Arial");
  const [tokens, setTokens] = useState(() => {
    const { name: _name, ...colors } = themeTokens.coral;
    void _name;
    return {
      ...colors,
      bg: "#FFFFFF",
      surface: "#FFFFFF",
      text: "#111111",
      muted: "#333333",
      accent: "#000000",
      accentText: "#FFFFFF",
    };
  });
  const [saving, setSaving] = useState(false);
  const labels = {
    bg: "배경",
    text: "본문",
    muted: "보조 텍스트",
    accent: "강조",
    accentText: "강조 배경의 글자",
    surface: "보조 배경",
    line: "구분선",
  };
  async function save() {
    setSaving(true);
    try {
      const saved = await api<Brand>("/brands", {
        method: "POST",
        body: JSON.stringify({
          brand: { name, font, tokens },
          id: editing?.id,
          expectedVersion: editing?.version,
        }),
      });
      brands.mutate((b) => [saved, ...(b ?? [])]);
      setEditing(saved);
      notify("브랜드 버전을 저장했습니다. 적용할 슬라이드를 확인해 주세요.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <details
      className="operation-panel"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>브랜드 스타일 관리</summary>
      <p>
        선택 슬라이드:{" "}
        {slide.brand
          ? `${slide.brand.name} v${slide.brand.version}`
          : "기본 테마"}
        . 적용한 색상과 글꼴은 슬라이드에 버전 사본으로 보관합니다.
      </p>
      {brands.error && (
        <p role="alert">
          {brands.error}
          <button className="btn" onClick={brands.retry}>
            브랜드 다시 불러오기
          </button>
        </p>
      )}
      <label htmlFor="brand-version">저장된 브랜드 버전</label>
      <select
        id="brand-version"
        value=""
        disabled={busy}
        onChange={(e) => {
          const b = brands.data?.find(
            (b) => `${b.id}@${b.version}` === e.target.value,
          );
          if (b) onApply(b);
        }}
      >
        <option value="">현재 슬라이드에 적용할 버전 선택</option>
        {brands.data?.map((b) => (
          <option key={`${b.id}@${b.version}`} value={`${b.id}@${b.version}`}>
            {b.name} v{b.version}
          </option>
        ))}
      </select>
      {slide.brand && (
        <button
          className="btn"
          disabled={busy}
          onClick={() => onApply(undefined)}
        >
          기본 테마로 돌아가기
        </button>
      )}
      <details>
        <summary>브랜드 만들기 / 새 버전 저장</summary>
        <label htmlFor="brand-edit">수정할 브랜드</label>
        <select
          id="brand-edit"
          value={editing ? `${editing.id}@${editing.version}` : ""}
          onChange={(e) => {
            const b = brands.data?.find(
              (b) => `${b.id}@${b.version}` === e.target.value,
            );
            setEditing(b);
            if (b) {
              setName(b.name);
              setFont(b.font);
              setTokens(b.tokens);
            }
          }}
        >
          <option value="">새 브랜드</option>
          {brands.data?.map((b) => (
            <option key={`${b.id}@${b.version}`} value={`${b.id}@${b.version}`}>
              {b.name} v{b.version}
            </option>
          ))}
        </select>
        <label htmlFor="brand-name">브랜드 이름</label>
        <input
          id="brand-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor="brand-font">글꼴</label>
        <select
          id="brand-font"
          value={font}
          onChange={(e) => setFont(e.target.value as Brand["font"])}
        >
          {["Arial", "Malgun Gothic", "Pretendard"].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <div className="brand-colors">
          {Object.entries(tokens).map(([key, color]) => (
            <label key={key}>
              {labels[key as keyof typeof labels]}
              <input
                type="color"
                value={color}
                onChange={(e) =>
                  setTokens((t) => ({ ...t, [key]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <p>
          글꼴 파일은 PPTX에 포함하지 않습니다. 열람 기기에 글꼴이 없으면 대체될
          수 있습니다.
        </p>
        <button
          className="btn"
          disabled={saving || busy}
          onClick={() => void save()}
        >
          브랜드 버전 저장
        </button>
      </details>
    </details>
  );
}
