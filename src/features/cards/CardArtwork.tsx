import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { cardImageUrls } from "../../lib/tcgdex/api";

interface CardArtworkProps {
  image: string | null;
  fallbackImage?: string | null | undefined;
  name: string;
  quality?: "low" | "high";
  tilt?: boolean;
  effectEnabled?: boolean;
}

export function CardArtwork(props: CardArtworkProps) {
  const imageUrls = [
    ...cardImageUrls(props.image, props.quality ?? "low"),
    ...cardImageUrls(props.fallbackImage ?? null, props.quality ?? "low"),
  ].filter((url, index, all) => all.indexOf(url) === index);

  return (
    <CardArtworkImage
      key={imageUrls.join("\u0000")}
      imageUrls={imageUrls}
      name={props.name}
      quality={props.quality ?? "low"}
      tilt={props.tilt ?? false}
      effectEnabled={props.effectEnabled ?? true}
    />
  );
}

function CardArtworkImage({
  imageUrls,
  name,
  quality,
  tilt,
  effectEnabled,
}: {
  imageUrls: string[];
  name: string;
  quality: "low" | "high";
  tilt: boolean;
  effectEnabled: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const boundsRef = useRef<DOMRect | null>(null);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const imageUrl = imageUrls[imageAttempt] ?? null;
  const imageFailed = imageAttempt >= imageUrls.length;
  const shouldTilt = tilt && effectEnabled && motionAllowed && !imageFailed;

  useEffect(() => {
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () =>
      setMotionAllowed(pointer.matches && !reducedMotion.matches);
    update();
    pointer.addEventListener("change", update);
    reducedMotion.addEventListener("change", update);
    return () => {
      pointer.removeEventListener("change", update);
      reducedMotion.removeEventListener("change", update);
    };
  }, []);

  const cancelFrame = useCallback(() => {
    if (frameRef.current !== null)
      window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const clearTilt = useCallback(() => {
    cancelFrame();
    const frame = wrapperRef.current?.querySelector<HTMLElement>(
      ".tilt-card__surface",
    );
    frame?.style.setProperty("--tilt-x", "0deg");
    frame?.style.setProperty("--tilt-y", "0deg");
    frame?.style.setProperty("--shine-x", "50%");
    frame?.style.setProperty("--shine-y", "50%");
    boundsRef.current = null;
  }, [cancelFrame]);

  useEffect(() => () => cancelFrame(), [cancelFrame]);

  useEffect(() => {
    if (shouldTilt) return;
    clearTilt();
  }, [clearTilt, shouldTilt]);

  useEffect(() => {
    if (!shouldTilt) return;
    const refreshBounds = () => {
      boundsRef.current = wrapperRef.current?.getBoundingClientRect() ?? null;
    };
    window.addEventListener("resize", refreshBounds);
    window.addEventListener("scroll", refreshBounds, true);
    return () => {
      window.removeEventListener("resize", refreshBounds);
      window.removeEventListener("scroll", refreshBounds, true);
    };
  }, [shouldTilt]);

  function onPointerEnter(event: PointerEvent<HTMLDivElement>) {
    if (
      !shouldTilt ||
      (event.pointerType !== "mouse" && event.pointerType !== "pen")
    )
      return;
    boundsRef.current = event.currentTarget.getBoundingClientRect();
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!shouldTilt || !boundsRef.current) return;
    const bounds = boundsRef.current;
    const pointerX = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left) / bounds.width),
    );
    const pointerY = Math.max(
      0,
      Math.min(1, (event.clientY - bounds.top) / bounds.height),
    );
    const surface = event.currentTarget.querySelector<HTMLElement>(
      ".tilt-card__surface",
    );
    if (!surface) return;

    cancelFrame();
    frameRef.current = window.requestAnimationFrame(() => {
      surface.style.setProperty("--tilt-x", `${(0.5 - pointerY) * 16}deg`);
      surface.style.setProperty("--tilt-y", `${(pointerX - 0.5) * 16}deg`);
      surface.style.setProperty("--shine-x", `${pointerX * 100}%`);
      surface.style.setProperty("--shine-y", `${pointerY * 100}%`);
      frameRef.current = null;
    });
  }

  return (
    <div
      ref={wrapperRef}
      className={`tilt-card${shouldTilt ? " tilt-card--enabled" : ""}${imageFailed || !imageUrl ? " tilt-card--empty" : ""}`}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={clearTilt}
      onPointerCancel={clearTilt}
      onBlur={clearTilt}
    >
      <div className="tilt-card__surface">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            loading={quality === "high" ? "eager" : "lazy"}
            onError={() => setImageAttempt((attempt) => attempt + 1)}
          />
        ) : (
          <span className="artwork-placeholder" aria-hidden="true">
            <span>Card image unavailable</span>
          </span>
        )}
        <span className="tilt-card__glare" aria-hidden="true" />
      </div>
    </div>
  );
}
