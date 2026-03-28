import type { ReactNode } from "react";
import { Card, CardBody, CardHeader, Chip, Divider, ScrollShadow, Skeleton } from "@heroui/react";
import { CalendarDays, Code2, FolderOpen, Tags, Users } from "lucide-react";
import type { SteamAppDetailsResult } from "@services/tauri";
import type { ConfiguredGame } from "@app-types/config";
import { resolveSteamSummaryBlurb } from "@utils/steamText";
import { useRunCompatibility } from "@hooks/useRunCompatibility";
import { GameDetailRunCompatibility } from "@features/game-detail/GameDetailRunCompatibility";

function SectionTitle({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-default-700 dark:text-default-300">
      {icon}
      {label}
    </div>
  );
}

interface GameDetailInfoProps {
  details: SteamAppDetailsResult | null;
  isLoading: boolean;
}

/** Contenido de la pestaña Resumen: descripción corta, géneros y categorías. */
export function GameDetailSummaryPanel({ details }: { details: SteamAppDetailsResult }) {
  const genreCount = details.genres.length;
  const categoryCount = details.categories.length;
  const blurb = resolveSteamSummaryBlurb(details);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {details.releaseDate ? (
          <Chip size="sm" variant="flat" color="secondary" startContent={<CalendarDays size={14} />}>
            {details.releaseDate}
          </Chip>
        ) : null}
        {genreCount > 0 ? (
          <Chip size="sm" variant="bordered" color="primary">
            {genreCount} género{genreCount === 1 ? "" : "s"}
          </Chip>
        ) : null}
        {categoryCount > 0 ? (
          <Chip size="sm" variant="bordered" color="default">
            {categoryCount} categoría{categoryCount === 1 ? "" : "s"}
          </Chip>
        ) : null}
      </div>

      {blurb ? (
        <Card className="border border-default-200/70 shadow-sm dark:border-default-100/25">
          <CardHeader className="flex flex-col items-start gap-1 border-b border-default-200/50 pb-3 dark:border-default-100/20">
            <p className="text-sm font-semibold text-foreground">Sinopsis</p>
            <p className="text-xs font-normal text-default-500">{blurb.subtitle}</p>
          </CardHeader>
          <CardBody className="pt-4">
            <p className="whitespace-pre-line text-base leading-relaxed text-default-600 dark:text-default-400">
              {blurb.text}
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card className="border border-dashed border-default-300/80 bg-default-50/30 dark:border-default-100/30 dark:bg-default-50/5">
          <CardBody className="px-5 py-4">
            <p className="text-sm leading-relaxed text-default-600 dark:text-default-400">
              No hay texto de presentación en la ficha de Steam. Puedes leer la descripción completa en la pestaña{" "}
              <span className="font-medium text-foreground">Detalles</span>.
            </p>
          </CardBody>
        </Card>
      )}

      {(details.genres.length > 0 || details.categories.length > 0) && (
        <div className="space-y-4 rounded-xl border border-default-200/60 bg-default-50/40 p-4 dark:border-default-100/20 dark:bg-default-50/10">
          {details.genres.length > 0 && (
            <div className="space-y-2">
              <SectionTitle icon={<Tags size={16} />} label="Géneros" />
              <div className="flex flex-wrap gap-2">
                {details.genres.map((genre) => (
                  <Chip key={genre} size="sm" variant="flat" color="primary">
                    {genre}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {details.categories.length > 0 && (
            <div className="space-y-2">
              <SectionTitle icon={<Code2 size={16} />} label="Categorías" />
              <div className="flex flex-wrap gap-2">
                {details.categories.map((cat) => (
                  <Chip key={cat} size="sm" variant="flat" color="default">
                    {cat}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Ficha técnica + descripción larga (HTML de Steam). */
export function GameDetailSteamDetailsPanel({ details }: { details: SteamAppDetailsResult }) {
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-default-600 dark:text-default-400">
        Metadatos del producto y descripción completa tal como aparecen en la tienda.
      </p>

      <Card className="border border-default-200/60 shadow-sm dark:border-default-100/20">
        <CardHeader className="flex flex-col items-start gap-1 border-b border-default-200/50 pb-3 dark:border-default-100/20">
          <p className="text-sm font-semibold text-foreground">Ficha técnica</p>
          <p className="text-xs font-normal text-default-500">Desarrollo, publicación y fecha</p>
        </CardHeader>
        <CardBody className="space-y-3 px-5 py-4">
          {details.developers.length > 0 && (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <SectionTitle icon={<Users size={16} />} label="Desarrollador" />
              <span className="text-sm text-default-600 dark:text-default-400">{details.developers.join(", ")}</span>
            </div>
          )}

          {details.publishers.length > 0 && (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <SectionTitle icon={<Users size={16} />} label="Editor" />
              <span className="text-sm text-default-600 dark:text-default-400">{details.publishers.join(", ")}</span>
            </div>
          )}

          {details.releaseDate && (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <SectionTitle icon={<CalendarDays size={16} />} label="Lanzamiento" />
              <span className="text-sm text-default-600 dark:text-default-400">{details.releaseDate}</span>
            </div>
          )}
        </CardBody>
      </Card>

      {details.detailedDescription && (
        <Card className="border border-default-200/60 shadow-sm dark:border-default-100/20">
          <CardHeader className="flex flex-col items-start gap-1 border-b border-default-200/50 pb-3 dark:border-default-100/20">
            <p className="text-sm font-semibold text-foreground">Información sobre el juego</p>
            <p className="text-xs font-normal text-default-500">Descripción detallada (HTML de Steam)</p>
          </CardHeader>
          <CardBody className="pt-2">
            <ScrollShadow className="max-h-[min(70vh,42rem)]" size={80}>
              <div
                className="prose prose-sm max-w-none px-1 py-2 text-default-600 dark:prose-invert [&_img]:max-w-full [&_img]:rounded-lg"
                dangerouslySetInnerHTML={{ __html: details.detailedDescription }}
              />
            </ScrollShadow>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export function GameDetailRequirementsPanel({ details }: { details: SteamAppDetailsResult }) {
  const hasStoreRequirements = !!(details.pcRequirementsMinimum || details.pcRequirementsRecommended);
  const compatibility = useRunCompatibility(
    details.pcRequirementsMinimum,
    details.pcRequirementsRecommended,
    hasStoreRequirements
  );

  if (!hasStoreRequirements) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-default-500">No hay requisitos publicados en la tienda para este título.</p>
        <p className="text-xs leading-relaxed text-default-400">
          Sin texto de requisitos en la ficha de Steam no podemos estimar si tu PC los cumple; busca la información en
          el sitio del desarrollador o en la tienda donde compraste el juego.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GameDetailRunCompatibility
        report={compatibility.data}
        isLoading={compatibility.isLoading}
        isError={compatibility.isError}
      />
      <p className="text-sm leading-relaxed text-default-600 dark:text-default-400">
        Especificaciones publicadas en la tienda. Pueden no coincidir con el hardware que uses para jugar desde
        SaveCloud.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {details.pcRequirementsMinimum && (
          <Card className="border border-default-200/60 shadow-sm dark:border-default-100/20">
            <CardBody className="px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-default-400">Mínimos</p>
              <div
                className="text-xs leading-relaxed text-default-500 [&_strong]:text-default-700 dark:[&_strong]:text-default-300"
                dangerouslySetInnerHTML={{ __html: details.pcRequirementsMinimum }}
              />
            </CardBody>
          </Card>
        )}
        {details.pcRequirementsRecommended && (
          <Card className="border border-default-200/60 shadow-sm dark:border-default-100/20">
            <CardBody className="px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-default-400">Recomendados</p>
              <div
                className="text-xs leading-relaxed text-default-500 [&_strong]:text-default-700 dark:[&_strong]:text-default-300"
                dangerouslySetInnerHTML={{ __html: details.pcRequirementsRecommended }}
              />
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

export function hasSteamRequirements(details: SteamAppDetailsResult): boolean {
  return !!(details.pcRequirementsMinimum || details.pcRequirementsRecommended);
}

/** Juegos sin ficha de Steam: rutas y metadatos locales. */
export function GameDetailLocalSummary({ game }: { game: ConfiguredGame }) {
  const pathCount = game.paths?.length ?? 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-default-600 dark:text-default-400">
        No hay datos de la tienda de Steam para este juego (no hay App ID o no se pudo cargar la ficha). Puedes seguir
        gestionando guardados y backups con las acciones de arriba.
      </p>
      <Card className="border border-default-200/60 bg-default-50/30 dark:border-default-100/20 dark:bg-default-50/10">
        <CardBody className="px-4 py-3">
          <p className="text-xs font-medium text-default-700 dark:text-default-300">Compatibilidad con tu PC</p>
          <p className="mt-2 text-xs leading-relaxed text-default-500">
            La comparación automática entre tu equipo y los requisitos del juego solo está disponible cuando la app
            puede obtener la ficha de Steam (requisitos publicados en la tienda). Para títulos fuera de Steam, revisa la
            web del juego o el lector de requisitos de la tienda donde lo compraste.
          </p>
        </CardBody>
      </Card>
      <Card className="border border-default-200/60 shadow-sm dark:border-default-100/20">
        <CardBody className="space-y-3 px-5 py-4">
          <div className="flex items-start gap-2">
            <FolderOpen size={16} className="mt-0.5 shrink-0 text-default-500" />
            <div>
              <p className="text-sm font-semibold text-foreground">Rutas de guardado</p>
              <p className="text-sm text-default-500">
                {pathCount === 0
                  ? "Ninguna ruta configurada."
                  : `${pathCount} ruta${pathCount === 1 ? "" : "s"} registrada${pathCount === 1 ? "" : "s"}.`}
              </p>
            </div>
          </div>
          {game.editionLabel && (
            <p className="text-sm text-default-600">
              <span className="font-medium text-default-700 dark:text-default-300">Origen / edición: </span>
              {game.editionLabel}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export function GameDetailInfoLoading() {
  return (
    <div className="space-y-4 pt-2">
      <Skeleton className="h-5 w-48 rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-5 w-32 rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  );
}

/** @deprecated Usar paneles con pestañas en GameDetailPage; se mantiene por compatibilidad. */
export function GameDetailInfo({ details, isLoading }: GameDetailInfoProps) {
  if (isLoading) {
    return <GameDetailInfoLoading />;
  }

  if (!details) return null;

  return (
    <div className="space-y-6">
      <GameDetailSummaryPanel details={details} />
      <Divider />
      <GameDetailSteamDetailsPanel details={details} />
      {hasSteamRequirements(details) && (
        <>
          <Divider />
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-default-700 dark:text-default-300">Requisitos del sistema</h3>
            <GameDetailRequirementsPanel details={details} />
          </div>
        </>
      )}
    </div>
  );
}
