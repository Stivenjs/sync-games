import { memo, useRef, type ImgHTMLAttributes } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useScrollContainerRef } from "@components/layout/ScrollContainerContext";

/**
 * Parallax + zoom solo para el hero del detalle de juego.
 * No usar fuera de esta pantalla: depende del scroll de `<main>`.
 */
export interface ParallaxHeroImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "style"> {
  wrapperClassName?: string;
}

export const ParallaxHeroImage = memo(function ParallaxHeroImage({
  wrapperClassName = "",
  className = "",
  alt,
  ...imgProps
}: ParallaxHeroImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useScrollContainerRef();
  const prefersReducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    container: scrollContainerRef ?? undefined,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [0, 0] : [50, -50]);
  const scale = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [1, 1] : [1, 1.1]);

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${wrapperClassName}`.trim()}>
      <motion.div
        className="size-full"
        style={{
          y,
          scale,
          willChange: "transform",
        }}>
        <img
          alt={alt}
          className={`size-full object-cover object-center ${className}`.trim()}
          decoding="async"
          {...imgProps}
        />
      </motion.div>
    </div>
  );
});
