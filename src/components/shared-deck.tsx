"use client";
import type { Deck, SlideTemplate } from "@/lib/domain";
import { resolveSlideTemplate } from "@/lib/template-version";
import { useApiResource } from "./use-api-resource";
import { SlideCanvas } from "./slide-canvas";
export function SharedDeck({ token }: { token: string }) {
  const resource = useApiResource<{ deck: Deck; templates: SlideTemplate[] }>(
    `/shared/${encodeURIComponent(token)}`,
  );
  return (
    <main className="shared-page">
      <h1>{resource.data?.deck.title ?? "공유 프레젠테이션"}</h1>
      <p>
        읽기 전용 사본입니다. 공유 이후의 수정은 이 사본에 반영되지 않습니다.
      </p>
      {resource.loading && <p role="status">불러오는 중</p>}
      {resource.error && <p role="alert">{resource.error}</p>}
      {resource.data?.deck.slides.map((slide, index) => (
        <section key={slide.id} aria-label={`${index + 1}번 슬라이드`}>
          <SlideCanvas
            slide={slide}
            template={resolveSlideTemplate(slide, resource.data!.templates)}
            slideNumber={index + 1}
          />
        </section>
      ))}
    </main>
  );
}
