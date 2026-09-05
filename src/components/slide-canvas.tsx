"use client";
import { memo, useEffect, useRef } from "react";
import { type Slide, type SlideTemplate } from "@/lib/domain";
import { slideSvg } from "@/lib/svg";

export const SlideCanvas = memo(function SlideCanvas({
  slide,
  template,
  showSlots = false,
  slideNumber = 1,
  className = "",
  selectedSlot,
  onMeasure,
}: {
  slide: Slide;
  template: SlideTemplate;
  showSlots?: boolean;
  slideNumber?: number;
  className?: string;
  selectedSlot?: string;
  onMeasure?: (slots: string[]) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onMeasure) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled || !element.current?.getBoundingClientRect().width) return;
      const overflow: string[] = [];
      for (const slot of template.slots) {
        const text = element.current.querySelector<SVGGraphicsElement>(
          `text[data-slot="${slot.key}"]`,
        );
        if (!text?.textContent) continue;
        const box = text.getBBox();
        const x = Math.round(slot.x * 1600),
          y = Math.round(slot.y * 900);
        if (
          box.x < x - 2 ||
          box.y < y - 2 ||
          box.x + box.width > x + slot.w * 1600 + 2 ||
          box.y + box.height > y + slot.h * 900 + 2
        )
          overflow.push(slot.key);
      }
      onMeasure(overflow);
    };
    void document.fonts.ready.then(measure);
    const observer = new ResizeObserver(measure);
    if (element.current) observer.observe(element.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [slide, template, onMeasure]);
  // Every interpolated value is escaped in slideSvg; no user HTML is accepted.
  return (
    <div
      ref={element}
      className={`slide-canvas ${className}`}
      dangerouslySetInnerHTML={{
        __html: slideSvg(slide, template, {
          showSlots,
          slideNumber,
          selectedSlot,
        }),
      }}
    />
  );
});
