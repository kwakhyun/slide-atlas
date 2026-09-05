import { SharedDeck } from "@/components/shared-deck";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <SharedDeck token={(await params).token} />;
}
