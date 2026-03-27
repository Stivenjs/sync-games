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
  gameName: string;
  gameId: string;
  isLoading?: boolean;
}

export function GameDetailHero({ mediaUrls, gameName, gameId, isLoading }: GameDetailHeroProps) {
  const navigate = useNavigate();
  const [loadedSlides, setLoadedSlides] = useState<Set<number>>(new Set());

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

  if (!mediaUrls.length) {
    return (
      <ViewTransition name={`game-hero-${gameId}`} share="hero-morph" default="none">
        <div className="group/hero relative -mx-6 -mt-16">
          <div className="flex aspect-21/9 w-full items-center justify-center bg-default-100">
            <Gamepad2 size={64} className="text-default-300" strokeWidth={1.2} />
          </div>
          <BackButton onPress={handleBack} />
        </div>
      </ViewTransition>
    );
  }

  return (
    <ViewTransition name={`game-hero-${gameId}`} share="hero-morph" default="none">
      <div className="group/hero relative -mx-6 -mt-16 w-[calc(100%+3rem)] overflow-hidden">
        <Swiper
          modules={[Autoplay, EffectFade]}
          effect="fade"
          fadeEffect={{ crossFade: true }}
          autoplay={{ delay: 2000, disableOnInteraction: false, pauseOnMouseEnter: true }}
          speed={1100}
          loop={mediaUrls.length > 1}
          className="aspect-21/9 w-full">
          {mediaUrls.map((url, i) => (
            <SwiperSlide key={url}>
              {!loadedSlides.has(i) && <Skeleton className="absolute inset-0 z-10 size-full" />}
              <img
                src={url}
                alt={`${gameName} screenshot ${i + 1}`}
                className="size-full object-cover object-center"
                onLoad={() => handleSlideLoad(i)}
              />
            </SwiperSlide>
          ))}
        </Swiper>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-linear-to-t from-background to-transparent" />

        <BackButton onPress={handleBack} />
      </div>
    </ViewTransition>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Button
      variant="flat"
      size="sm"
      isIconOnly
      onPress={onPress}
      className="absolute left-4 top-20 z-20 bg-black/50 text-white backdrop-blur-sm opacity-0 transition-opacity duration-200 group-hover/hero:opacity-100 hover:bg-black/70"
      aria-label="Volver a juegos">
      <ArrowLeft size={18} />
    </Button>
  );
}
