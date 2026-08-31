import type { Metadata } from "next";
import { Library } from "@/components/library";
export const metadata: Metadata = { title: "온톨로지 라이브러리" };
export default function Page() {
  return <Library />;
}
