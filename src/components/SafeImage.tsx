"use client";

import React, { useState } from "react";
import Image, { type ImageProps } from "next/image";

export interface SafeImageProps extends Omit<ImageProps, "onError"> {
  fallbackIcon?: React.ReactNode;
  fallbackText?: string;
  fallbackClassName?: string;
}

/**
 * SafeImage — Resilient image component that catches 404s, CORS and broken URLs
 * and gracefully renders an elegant fallback without native broken image artifacts.
 */
export function SafeImage({
  src,
  alt,
  fallbackIcon,
  fallbackText,
  fallbackClassName,
  className,
  ...props
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-white/[0.04] border border-white/10 text-white/40 ${
          fallbackClassName || ""
        }`}
      >
        {fallbackIcon || (
          <div className="flex flex-col items-center justify-center gap-1">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 opacity-40">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z" />
            </svg>
            {fallbackText && (
              <span className="text-[10px] font-bold text-white/50">{fallbackText}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt || "Imagen"}
      className={className}
      unoptimized={true}
      onError={() => setHasError(true)}
      {...props}
    />
  );
}

