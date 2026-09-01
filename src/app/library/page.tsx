import type { Metadata } from "next";
import { Library } from "@/components/library";
import { INTENTS, type Intent } from "@/lib/domain";
export const metadata: Metadata = { title: "온톨로지 라이브러리" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;
  const initialIntent = INTENTS.includes(intent as Intent)
    ? (intent as Intent)
    : undefined;
  return <Library initialIntent={initialIntent} />;
}
