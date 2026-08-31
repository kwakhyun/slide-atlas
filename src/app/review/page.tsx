import type { Metadata } from "next";
import { Review } from "@/components/review";
export const metadata: Metadata = { title: "검수 인박스" };
export default function Page() {
  return <Review />;
}
