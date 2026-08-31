import type { Metadata } from "next";
import { Experiments } from "@/components/experiments";
export const metadata: Metadata = { title: "검색 실험실" };
export default function Page() {
  return <Experiments />;
}
