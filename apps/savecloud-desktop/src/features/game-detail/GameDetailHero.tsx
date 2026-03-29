import { useState, useCallback, startTransition, addTransitionType, ViewTransition } from "react";
import { useNavigate } from "react-router-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectFade } from "swiper/modules";
import { Button, Skeleton } from "@heroui/react";
import { ArrowLeft, Gamepad2 } from "lucide-react";
import "swiper/css";
import "swiper/css/effect-fade";

interface GameDetailHeroProps {
  mediaUrls: string[];
  /** Imagen ancha de Steam (header ~460px) solo si no hay capturas ni library hero. */
  headerImage?: string | null;
  /** Imagen ancha de biblioteca Steam (~3840px); mejor que header para hero. */
  libraryHeroFallbackUrl?: string | null;
  /** Imagen personalizada del juego (no Steam). */
  customImageUrl?: string | null;
  gameName: string;
  editionLabel?: string | null;
  gameId: string;
  isLoading?: boolean;
}

export function GameDetailHero({
  mediaUrls,
  headerImage,
  libraryHeroFallbackUrl,
  customImageUrl,
  gameName,
  editionLabel,
  gameId,
  isLoading,
}: GameDetailHeroProps) {
  const navigate = useNavigate();
  const [loadedSlides, setLoadedSlides] = useState<Set<number>>(new Set());

  const heroSlides =
    mediaUrls.length > 0
      ? mediaUrls
      : customImageUrl
        ? [customImageUrl]
        : libraryHeroFallbackUrl
          ? [libraryHeroFallbackUrl]
          : headerImage
            ? [headerImage]
            : [];

  const handleSlideLoad = useCallback((index: number) => {
    setLoadedSlides((prev) => new Set(prev).add(index));
  }, []);

  const handleBack = useCallback(() => {
    startTransition(() => {
      addTransitionType("game-detail");
      navigate("/");
    });
  }, [navigate]);

  if (isLoading) {
    return (
      <ViewTransition name={`game-hero-${gameId}`} share="hero-morph" default="none">
        <div className="-mx-6 -mt-16">
          <Skeleton className="aspect-21/9 w-full" />
        </div>
      </ViewTransition>
    );
  }

  if (!heroSlides.length) {
    return (
      <ViewTransition name={`game-hero-${gameId}`} share="hero-morph" default="none">
        <div className="group/hero relative -mx-6 -mt-16 w-[calc(100%+3rem)] overflow-hidden">
          <div className="flex aspect-21/9 w-full items-center justify-center bg-linear-to-br from-default-100 to-default-200 dark:from-default-50/30 dark:to-default-100/20">
            <Gamepad2 size={64} className="text-default-300" strokeWidth={1.2} />
          </div>
          <HeroGradient />
          <TitleOverlay editionLabel={editionLabel} gameName={gameName} />
          <BackButton onPress={handleBack} />
        </div>
      </ViewTransition>
    );
  }

  const useSwiper = heroSlides.length > 1;

  return (
    <ViewTransition name={`game-hero-${gameId}`} share="hero-morph" default="none">
      <div className="group/hero relative -mx-6 -mt-16 w-[calc(100%+3rem)] overflow-hidden">
        {useSwiper ? (
          <Swiper
            modules={[Autoplay, EffectFade]}
            effect="fade"
            fadeEffect={{ crossFade: true }}
            autoplay={{ delay: 2800, disableOnInteraction: false, pauseOnMouseEnter: true }}
            speed={1100}
            loop={heroSlides.length > 1}
            className="aspect-21/9 w-full">
            {heroSlides.map((url, i) => (
              <SwiperSlide key={url}>
                {!loadedSlides.has(i) && <Skeleton className="absolute inset-0 z-10 size-full" />}
                <img
                  src={url}
                  alt={`${gameName} captura ${i + 1}`}
                  className="size-full object-cover object-center"
                  decoding="async"
                  fetchPriority={i === 0 ? "high" : "auto"}
                  onLoad={() => handleSlideLoad(i)}
                />
              </SwiperSlide>
            ))}
          </Swiper>
        ) : (
          <div className="relative aspect-21/9 w-full">
            {!loadedSlides.has(0) && <Skeleton className="absolute inset-0 z-10 size-full" />}
            <img
              src={heroSlides[0]}
              alt={gameName}
              className="size-full object-cover object-center"
              decoding="async"
              fetchPriority="high"
              onLoad={() => handleSlideLoad(0)}
            />
          </div>
        )}

        <HeroGradient />
        <TitleOverlay editionLabel={editionLabel} gameName={gameName} />
        <BackButton onPress={handleBack} />
      </div>
    </ViewTransition>
  );
}

function HeroGradient() {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-linear-to-t from-background via-background/40 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-linear-to-b from-black/50 to-transparent" />
    </>
  );
}

function TitleOverlay({ gameName, editionLabel }: { gameName: string; editionLabel?: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-5 pb-5 pt-20 sm:px-6 sm:pb-6">
      <h1 className="text-balance text-2xl font-bold tracking-tight text-white drop-shadow-md sm:text-3xl md:text-4xl">
        {gameName}
      </h1>
      {editionLabel ? <p className="mt-1 text-sm font-medium text-white/85 drop-shadow">{editionLabel}</p> : null}
    </div>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Button
      variant="flat"
      size="sm"
      isIconOnly
      onPress={onPress}
      className="absolute left-4 top-4 z-30 bg-black/45 text-white backdrop-blur-md hover:bg-black/65"
      aria-label="Volver a juegos">
      <ArrowLeft size={18} />
    </Button>
  );
}
