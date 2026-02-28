import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import type { SaveRepository } from "@domain/ports/SaveRepository";
import { GetUploadUrlUseCase } from "@application/use-cases/GetUploadUrlUseCase";
import { GetDownloadUrlUseCase } from "@application/use-cases/GetDownloadUrlUseCase";
import { ListSavesUseCase } from "@application/use-cases/ListSavesUseCase";
import { registerSavesRoutes } from "@interfaces/http/routes/saves.routes";

export interface AppDependencies {
  saveRepository: SaveRepository;
}

/**
 * Crea y configura la aplicación Fastify con las rutas y casos de uso.
 * Inyección de dependencias en el punto de entrada (composition root).
 */
export async function buildApp(
  deps: AppDependencies
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  const getUploadUrlUseCase = new GetUploadUrlUseCase(deps.saveRepository);
  const getDownloadUrlUseCase = new GetDownloadUrlUseCase(deps.saveRepository);
  const listSavesUseCase = new ListSavesUseCase(deps.saveRepository);

  await registerSavesRoutes(app, {
    getUploadUrlUseCase,
    getDownloadUrlUseCase,
    listSavesUseCase,
  });

  app.get("/health", async (_, reply: FastifyReply) => {
    return reply.send({ status: "ok" });
  });

  return app;
}
