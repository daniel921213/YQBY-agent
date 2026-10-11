import type { JSONContent } from "@tiptap/core";
import { call, type Journal } from "./journal-api";
import { getToken } from "./auth";

export type ReviewMeta = { user_id: number; can_review: boolean; teachers: { id: number; name: string }[] };
export type ReviewStatus = "pending" | "reviewing" | "returned";
export type ReviewSummary = {
  id: number; journal_id: number | null; student_id: number; student_name: string; student_uid: string;
  teacher_id: number; teacher_name: string; title: string; status: ReviewStatus;
  round_number: number; previous_id: number | null; created_at: string; updated_at: string; returned_at: string | null;
};
export type ReviewComment = { anchor: string; text: string };
export type Review = ReviewSummary & { snapshot: Journal; question: string; is_student: boolean; can_edit: boolean; version: number; feedback: JSONContent | null; comments: ReviewComment[] };
export type ReviewNotice = { id: number; review_id: number; kind: "submitted" | "returned"; name: string; title: string };
const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const reviewMeta = () => call<ReviewMeta>("/reviews/meta");
export const listReviews = (inbox = false) => call<ReviewSummary[]>(`/reviews?inbox=${inbox}`);
export const getReview = (id: number) => call<Review>(`/reviews/${id}`);
export const submitReview = (journal_id: number, teacher_id: number, question: string, request_key: string) => call<Review>("/reviews", { method: "POST", ...json({ journal_id, teacher_id, question, request_key }) });
export const startReview = (id: number) => call<Review>(`/reviews/${id}/start`, { method: "POST" });
export const saveFeedback = (id: number, version: number, document: JSONContent, comments: ReviewComment[], publish: boolean) => call<Review>(`/reviews/${id}/feedback?publish=${publish}`, { method: "PUT", ...json({ version, document, comments }) });
export const reviewNotices = () => call<ReviewNotice[]>("/reviews/notifications");
export const readReviewNotice = (id: number) => call(`/reviews/notifications/${id}/read`, { method: "POST" });
export async function uploadReviewImage(id: number, file: File) {
  return (await call<{ id: number }>(`/reviews/${id}/images`, { method: "POST", headers: { "Content-Type": file.type }, body: file })).id;
}
export async function reviewImageUrl(id: number, imageId: number, signal?: AbortSignal) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  const token = getToken();
  const response = await fetch(new URL(`/api/v1/reviews/${id}/images/${imageId}`, base), { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store", signal });
  if (!response.ok) throw new Error("圖片無法載入");
  return URL.createObjectURL(await response.blob());
}
export function reviewError(error: unknown) {
  const key = error instanceof Error ? error.message : "";
  return ({ review_already_pending: "這篇日誌已送交，請等待本輪回覆。", teacher_unavailable: "這位老師目前無法接收作業，請重新選擇。", journal_content_required: "請先寫下日誌內容，再送交批改。", review_version_conflict: "另一個視窗已更新批改內容。請先複製未儲存的文字，再重新開啟作業。", review_already_returned: "這一輪已送出回饋，不能再修改。", feedback_required: "請先留下評論或整體建議。", review_not_found: "這份作業目前無法開啟。", not_found: "此頁面目前無法開啟。", image_size_limit_5mb: "圖片上限為 5 MB。" } as Record<string, string>)[key] ?? (key || "操作失敗，請稍後重試。");
}
