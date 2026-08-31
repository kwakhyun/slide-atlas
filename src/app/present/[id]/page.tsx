import type { Metadata } from "next";
import { Present } from "@/components/present";
export const metadata: Metadata = {
  title: "프레젠테이션",
  robots: { index: false, follow: false },
  openGraph: { images: [] },
  twitter: { images: [] },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Present id={id} />;
}
