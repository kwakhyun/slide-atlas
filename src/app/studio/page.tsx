import type { Metadata } from "next";
import { Studio } from "@/components/studio";
export const metadata: Metadata = { title: "슬라이드 스튜디오" };
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template } = await searchParams;
  return <Studio initialTemplateId={template} />;
}
