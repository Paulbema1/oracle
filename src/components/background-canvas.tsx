"use client";

import { useEffect, useRef } from "react";

interface Candle {
  o: number;
  c: number;
  h: number;
  l: number;
}

/** Fond animé : graphique en chandeliers qui défile doucement, façon terminal. */
export default function BackgroundCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const CANDLE_W = 22;
    const GAP = 12;
    const STEP = CANDLE_W + GAP;
    let candles: Candle[] = [];
    let price = 0.5;
    let offset = 0;

    const nextCandle = (): Candle => {
      const drift = (Math.random() - 0.478) * 0.016;
      const o = price;
      price = Math.min(0.86, Math.max(0.14, price + drift));
      const c = price;
      const h = Math.max(o, c) + Math.random() * 0.012;
      const l = Math.min(o, c) - Math.random() * 0.012;
      return { o, c, h, l };
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.ceil(width / STEP) + 4;
      if (candles.length < count) {
        while (candles.length < count) candles.push(nextCandle());
      } else {
        candles = candles.slice(candles.length - count);
      }
    };

    const y = (v: number) => height * (1 - v);

    let last = performance.now();
    const SPEED = 14; // px / s

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      offset += SPEED * dt;
      while (offset >= STEP) {
        offset -= STEP;
        candles.shift();
        candles.push(nextCandle());
      }

      ctx.clearRect(0, 0, width, height);

      // dernière ligne de prix
      const lp = y(price);
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = "rgba(46, 242, 161, 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, lp);
      ctx.lineTo(width, lp);
      ctx.stroke();
      ctx.setLineDash([]);

      candles.forEach((cd, i) => {
        const x = i * STEP - offset;
        const up = cd.c >= cd.o;
        const colUp = `rgba(46, 242, 161, ${0.10 + i / candles.length * 0.14})`;
        const colDown = `rgba(255, 84, 112, ${0.09 + i / candles.length * 0.13})`;
        const col = up ? colUp : colDown;

        ctx.strokeStyle = col;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x + CANDLE_W / 2, y(cd.h));
        ctx.lineTo(x + CANDLE_W / 2, y(cd.l));
        ctx.stroke();

        ctx.fillStyle = col;
        const top = y(Math.max(cd.o, cd.c));
        const bh = Math.max(3, Math.abs(y(cd.o) - y(cd.c)));
        ctx.fillRect(x, top, CANDLE_W, bh);
      });

      raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-70"
      style={{ maskImage: "radial-gradient(ellipse 100% 90% at 50% 10%, black 20%, transparent 85%)" }}
    />
  );
}
