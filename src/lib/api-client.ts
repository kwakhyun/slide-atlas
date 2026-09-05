export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body && !isFormData
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    credentials: "same-origin",
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.error?.message ?? "요청을 처리하지 못했습니다.",
      result.error?.code ?? "UNKNOWN",
      response.status,
      result.error?.requestId,
    );
  return result.data as T;
}
