import type { FastifyRequest } from "fastify";

const USER_ID_HEADER = "x-user-id";

export function getUserId(request: FastifyRequest): string {
  const userId = request.headers[USER_ID_HEADER];
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("Missing or invalid x-user-id header");
  }
  return userId.trim();
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    err != null &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  if (err != null && typeof err === "object" && "code" in err) return String((err as { code: unknown }).code);
  return String(err);
}
