import { Button, Input } from "@heroui/react";
import { Search } from "lucide-react";
import type { ConfiguredGame } from "@app-types/config";
import { filterGamesBySearch, isSteamGame } from "@utils/gameImage";

export type OriginFilter = "all" | "steam" | "other";

export interface GamesFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  originFilter: OriginFilter;
  onOriginFilterChange: (value: OriginFilter) => void;
}

export function filterGames(
  games: readonly ConfiguredGame[],
  searchTerm: string,
  originFilter: OriginFilter
): ConfiguredGame[] {
  let result = filterGamesBySearch(games, searchTerm);

  if (originFilter === "steam") {
    result = result.filter(isSteamGame);
  } else if (originFilter === "other") {
    result = result.filter((g) => !isSteamGame(g));
  }

  return result;
}

export function GamesFilters({
  searchTerm,
  onSearchChange,
  originFilter,
  onOriginFilterChange,
}: GamesFiltersProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <Input
        placeholder="Buscar juegos..."
        value={searchTerm}
        onValueChange={onSearchChange}
        startContent={<Search size={18} className="text-default-400" />}
        className="max-w-xs"
        size="md"
        variant="bordered"
        isClearable
        onClear={() => onSearchChange("")}
      />
      <div className="flex flex-wrap gap-2">
        {(
          [
            { value: "all" as const, label: "Todos" },
            { value: "steam" as const, label: "Steam" },
            { value: "other" as const, label: "Otros" },
          ] as const
        ).map(({ value, label }) => (
          <Button
            key={value}
            size="sm"
            variant={originFilter === value ? "solid" : "bordered"}
            color={originFilter === value ? "primary" : "default"}
            onPress={() => onOriginFilterChange(value)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
