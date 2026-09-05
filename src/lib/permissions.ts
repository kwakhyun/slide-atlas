import type { TemplateStatus } from "./domain";
export type TeamRole = "owner" | "editor" | "reviewer" | "viewer";
export const canEdit = (role?: TeamRole) =>
  !role || role === "owner" || role === "editor";
export const canComment = (role?: TeamRole) => !!role && role !== "viewer";
export function canReview(role: TeamRole | undefined, status: TemplateStatus) {
  if (!role || role === "owner") return true;
  return status === "in_review"
    ? role === "editor"
    : role === "reviewer" && ["approved", "rejected"].includes(status);
}
