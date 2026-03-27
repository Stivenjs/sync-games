import { Card, CardBody, Chip, Divider, Skeleton } from "@heroui/react";
import { CalendarDays, Code2, Tags, Users } from "lucide-react";
import type { SteamAppDetailsResult } from "@services/tauri";

interface GameDetailInfoProps {
  details: SteamAppDetailsResult | null;
  isLoading: boolean;
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-default-700">
      {icon}
      {label}
    </div>
  );
}

export function GameDetailInfo({ details, isLoading }: GameDetailInfoProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-48 rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-5 w-32 rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  if (!details) return null;

  return (
    <div className="space-y-6">
      {/* Descripción corta */}
      {details.shortDescription && (
        <p className="text-base leading-relaxed text-default-600">{details.shortDescription}</p>
      )}

      {/* Géneros y categorías */}
      {(details.genres.length > 0 || details.categories.length > 0) && (
        <div className="space-y-3">
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

      <Divider />

      {/* Metadata: developer, publisher, release date */}
      <Card className="border border-default-200/60 shadow-sm">
        <CardBody className="space-y-3 px-5 py-4">
          {details.developers.length > 0 && (
            <div className="flex items-start gap-2">
              <SectionTitle icon={<Users size={16} />} label="Desarrollador" />
              <span className="text-sm text-default-500">{details.developers.join(", ")}</span>
            </div>
          )}

          {details.publishers.length > 0 && (
            <div className="flex items-start gap-2">
              <SectionTitle icon={<Users size={16} />} label="Editor" />
              <span className="text-sm text-default-500">{details.publishers.join(", ")}</span>
            </div>
          )}

          {details.releaseDate && (
            <div className="flex items-start gap-2">
              <SectionTitle icon={<CalendarDays size={16} />} label="Lanzamiento" />
              <span className="text-sm text-default-500">{details.releaseDate}</span>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Descripción detallada (HTML de Steam) */}
      {details.detailedDescription && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-default-700">Información sobre el juego</h3>
          <div
            className="prose prose-sm max-w-none text-default-600 dark:prose-invert [&_img]:rounded-lg [&_img]:max-w-full"
            dangerouslySetInnerHTML={{ __html: details.detailedDescription }}
          />
        </div>
      )}

      {/* Requisitos del sistema */}
      {(details.pcRequirementsMinimum || details.pcRequirementsRecommended) && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-default-700">Requisitos del sistema</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {details.pcRequirementsMinimum && (
              <Card className="border border-default-200/60 shadow-sm">
                <CardBody className="px-4 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-default-400">Mínimos</p>
                  <div
                    className="text-xs leading-relaxed text-default-500 [&_strong]:text-default-700"
                    dangerouslySetInnerHTML={{ __html: details.pcRequirementsMinimum }}
                  />
                </CardBody>
              </Card>
            )}
            {details.pcRequirementsRecommended && (
              <Card className="border border-default-200/60 shadow-sm">
                <CardBody className="px-4 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-default-400">Recomendados</p>
                  <div
                    className="text-xs leading-relaxed text-default-500 [&_strong]:text-default-700"
                    dangerouslySetInnerHTML={{ __html: details.pcRequirementsRecommended }}
                  />
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
