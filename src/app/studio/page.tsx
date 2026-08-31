import type { Metadata } from "next";
import { Studio } from "@/components/studio";
export const metadata: Metadata = { title: "슬라이드 스튜디오" };
export default function StudioPage() {
  return <Studio />;
}
