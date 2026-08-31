import type { Metadata } from "next";
import { Workspace } from "@/components/workspace";
import "./globals.css";
import "./workbench.css";

export const metadata: Metadata = {
  title: {
    default: "Slide Atlas — 생각을 구조로, 구조를 디자인으로",
    template: "%s · Slide Atlas",
  },
  description:
    "디자인 온톨로지, 구조 기반 검색, 슬라이드 편집, 품질 검수와 실험을 연결한 프로덕트 엔지니어링 포트폴리오.",
  openGraph: {
    title: "Slide Atlas",
    description: "Ideas into structure. A design intelligence workbench.",
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Slide Atlas",
    description: "생각을 구조로, 구조를 디자인으로.",
  },
  robots: { index: true, follow: true },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <Workspace>{children}</Workspace>
      </body>
    </html>
  );
}
