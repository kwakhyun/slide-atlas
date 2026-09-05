import { memo } from "react";
import { type Slide, type SlideTemplate } from "@/lib/domain";
import { slideSvg } from "@/lib/svg";

export const SlideCanvas = memo(function SlideCanvas({
  slide,
  template,
  showSlots = false,
  slideNumber = 1,
  className = "",
}: {
  slide: Slide;
  template: SlideTemplate;
  showSlots?: boolean;
  slideNumber?: number;
  className?: string;
}) {
  // Every interpolated value is escaped in slideSvg; no user HTML is accepted.
  return (
    <div
      className={`slide-canvas ${className}`}
      dangerouslySetInnerHTML={{
        __html: slideSvg(slide, template, { showSlots, slideNumber }),
      }}
    />
  );
});
