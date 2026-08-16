"use client";

import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SolitaireCard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  color: string;
  image?: HTMLImageElement | null;
}

interface SolitaireVictoryAnimationProps {
  planetName: string;
  level?: number;
  totalTracks?: number;
  albumCovers?: string[];
  onClose: () => void;
}

export function SolitaireVictoryAnimation({
  planetName,
  level = 1,
  totalTracks,
  albumCovers = [],
  onClose,
}: SolitaireVictoryAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let spawnTimerId: NodeJS.Timeout | number;

    const dpr = window.devicePixelRatio || 1;
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;

    canvas.width = viewWidth * dpr;
    canvas.height = viewHeight * dpr;
    ctx.scale(dpr, dpr);

    // Preload album cover images
    const loadedImages: HTMLImageElement[] = [];
    const validCovers = (albumCovers || []).filter(Boolean);
    validCovers.slice(0, 30).forEach((url) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      loadedImages.push(img);
    });

    const cardWidth = 76;
    const cardHeight = 100;
    const colors = [
      "#10b981", // Spotify Emerald
      "#38bdf8", // Cyan
      "#a855f7", // Purple
      "#f59e0b", // Amber
      "#ec4899", // Pink
      "#22c55e", // Lime
      "#06b6d4", // Teal
    ];

    const activeCards: SolitaireCard[] = [];
    let cardsSpawned = 0;
    const maxCards = 60;

    // 4 to 7 Foundation decks across the top
    const numFoundations = Math.min(8, Math.max(4, Math.floor(viewWidth / 140)));
    const foundationSpacing = viewWidth / (numFoundations + 1);

    const spawnCard = () => {
      if (cardsSpawned >= maxCards) return;

      const foundationIdx = cardsSpawned % numFoundations;
      const startX = foundationSpacing * (foundationIdx + 1) - cardWidth / 2;
      const startY = 30 + Math.random() * 40;

      // Random horizontal trajectory left or right
      const direction = Math.random() > 0.5 ? 1 : -1;
      const vx = (Math.random() * 4 + 3.5) * direction;
      const vy = -(Math.random() * 4 + 2);

      const color = colors[cardsSpawned % colors.length];
      const img = loadedImages.length > 0 ? loadedImages[cardsSpawned % loadedImages.length] : null;

      activeCards.push({
        x: startX,
        y: startY,
        vx,
        vy,
        width: cardWidth,
        height: cardHeight,
        color,
        image: img,
      });

      cardsSpawned++;
    };

    // Initial blast: spawn 3 cards immediately
    spawnCard();
    spawnCard();
    spawnCard();

    // Spawn a new cascading card every 180ms
    spawnTimerId = setInterval(spawnCard, 180);

    const gravity = 0.68;
    const bounceFactor = -0.82;

    const render = () => {
      // NOTE: We do NOT call ctx.clearRect() so each card leaves a solid cascade trail!

      for (let i = activeCards.length - 1; i >= 0; i--) {
        const card = activeCards[i];

        // Draw card with subtle drop shadow
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 3;

        // Card background
        ctx.beginPath();
        ctx.roundRect(card.x, card.y, card.width, card.height, 8);
        ctx.fillStyle = "#0c0c16";
        ctx.fill();

        // Card border
        ctx.lineWidth = 2;
        ctx.strokeStyle = card.color;
        ctx.stroke();

        // Inner Artwork
        if (card.image && card.image.complete && card.image.naturalWidth > 0) {
          try {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(card.x + 4, card.y + 4, card.width - 8, card.height - 8, 6);
            ctx.clip();
            ctx.drawImage(card.image, card.x + 4, card.y + 4, card.width - 8, card.height - 8);
            ctx.restore();
          } catch (_) {}
        } else {
          // Retro Holographic Spotify / Vinyl Placeholder
          ctx.fillStyle = card.color;
          ctx.font = "bold 24px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("🎵", card.x + card.width / 2, card.y + card.height / 2 + 8);
        }

        ctx.restore();

        // Physics integration
        card.x += card.vx;
        card.vy += gravity;
        card.y += card.vy;

        // Bounce on bottom viewport boundary
        if (card.y + card.height >= viewHeight) {
          card.y = viewHeight - card.height;
          card.vy *= bounceFactor;
          card.vx *= 0.99; // Slight friction
        }

        // Remove card when offscreen
        if (card.x < -cardWidth * 2 || card.x > viewWidth + cardWidth * 2 || card.y > viewHeight + 250) {
          activeCards.splice(i, 1);
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(spawnTimerId);
    };
  }, [albumCovers]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-between p-6 pointer-events-auto bg-black/60 backdrop-blur-xs select-none"
      >
        {/* Canvas for Nostalgic Solitaire cascade trail */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Top Header Victory Card */}
        <motion.div
          initial={{ y: -60, scale: 0.85, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 25, delay: 0.15 }}
          className="relative z-10 flex flex-col items-center gap-2 rounded-3xl border-2 border-emerald-400 bg-[#0c0c16]/95 px-8 py-5 text-center shadow-[0_0_60px_rgba(16,185,129,0.5)] backdrop-blur-2xl max-w-md"
        >
          <div className="flex items-center gap-2">
            <span className="text-3xl animate-bounce">👑</span>
            <h2 className="text-2xl font-black text-white tracking-tight">
              ¡NIVEL {level} ALCANZADO!
            </h2>
            <span className="text-3xl animate-bounce">🪐</span>
          </div>

          <p className="text-sm font-bold text-emerald-400">
            {planetName} ha superado {totalTracks ? `${totalTracks} canciones` : `${level * 100} canciones`} curadas
          </p>

          <p className="text-xs text-white/70 leading-relaxed max-w-xs">
            Has completado la masa crítica. ¡El Sistema Orbital ha consagrado esta playlist como Coherente y Curada!
          </p>
        </motion.div>

        {/* Bottom CTA to dismiss */}
        <motion.div
          initial={{ y: 60, scale: 0.85, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 25, delay: 0.25 }}
          className="relative z-10"
        >
          <button
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-full bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 px-8 py-3.5 text-sm font-black text-black shadow-2xl shadow-emerald-500/60 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <span>¡Continuar Curando!</span>
            <span>⚡</span>
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
