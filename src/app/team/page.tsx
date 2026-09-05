import type { Metadata } from "next";
import { Team } from "@/components/team";
export const metadata: Metadata = { title: "계정과 팀 작업 공간" };
export default function TeamPage() {
  return <Team />;
}
