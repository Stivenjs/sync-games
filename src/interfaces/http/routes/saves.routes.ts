import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GetUploadUrlUseCase } from "@application/use-cases/GetUploadUrlUseCase";
import type { GetDownloadUrlUseCase } from "@application/use-cases/GetDownloadUrlUseCase";
import type { ListSavesUseCase } from "@application/use-cases/ListSavesUseCase";

const USER_ID_HEADER = "x-user-id";

function getUserId(request: FastifyRequest): string {
  const userId = request.headers[USER_ID_HEADER];
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("Missing or invalid x-user-id header");
  }
  return userId.trim();
}

export async function registerSavesRoutes(
  app: FastifyInstance,
  deps: {
    getUploadUrlUseCase: GetUploadUrlUseCase;
    getDownloadUrlUseCase: GetDownloadUrlUseCase;
    listSavesUseCase: ListSavesUseCase;
  }
): Promise<void> {
  app.get("/saves", async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);
    const saves = await deps.listSavesUseCase.execute({ userId });
    return reply.send(saves);
  });

  app.post<{
    Body: { gameId: string; filename: string };
  }>("/saves/upload-url", async (request, reply) => {
    const userId = getUserId(request);
    const { gameId, filename } = request.body ?? {};
    if (!gameId?.trim() || !filename?.trim()) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "gameId and filename are required",
      });
    }
    const result = await deps.getUploadUrlUseCase.execute({
      userId,
      gameId: gameId.trim(),
      filename: filename.trim(),
    });
    return reply.send(result);
  });

  app.post<{
    Body: { gameId: string; key: string };
  }>("/saves/download-url", async (request, reply) => {
    const userId = getUserId(request);
    const { gameId, key } = request.body ?? {};
    if (!gameId?.trim() || !key?.trim()) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "gameId and key are required",
      });
    }
    const result = await deps.getDownloadUrlUseCase.execute({
      userId,
      gameId: gameId.trim(),
      key: key.trim(),
    });
    return reply.send(result);
  });
}
