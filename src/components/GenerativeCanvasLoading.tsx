import React, { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";

interface GenerativeCanvasLoadingProps {
  prompt?: string;
  mediaType?: "image" | "video";
  onComplete?: () => void;
  className?: string;
  isResolved?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  targetAlpha: number;
  angle: number;
  speed: number;
  life: number;
  maxLife: number;
  history: { x: number; y: number }[];
  isSpark?: boolean;
}

const PHRASES = [
  "Sketching the composition...",
  "Synthesizing light & shadows...",
  "Applying brush strokes & color palette...",
  "Refining fine textures & details...",
  "Materializing final render...",
];

export const GenerativeCanvasLoading: React.FC<GenerativeCanvasLoadingProps> = ({
  prompt = "Generating image",
  mediaType = "image",
  className = "",
  isResolved = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [currentPhraseIdx, setCurrentPhraseIdx] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Rotating phrases and elapsed timer
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
      const nextIdx = Math.min(
        PHRASES.length - 1,
        Math.floor(elapsed / 2.5) % PHRASES.length
      );
      setCurrentPhraseIdx(nextIdx);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Canvas particle and scanline simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 480;
    let height = 480;

    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    const particleCount = isMobile ? 320 : 680;

    const resize = () => {
      if (!containerRef.current || !canvas) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width || 480;
      height = rect.height || 480;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    const resizeObserver = new ResizeObserver(() => resize());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Color palette: Zen Brand Green dominant, emerald, clean white, spark gold/lavender
    const colors = [
      "rgba(72, 160, 76, ",    // Brand green #48A04C
      "rgba(82, 184, 87, ",    // Bright brand green #52b857
      "rgba(52, 211, 153, ",   // Emerald/mint
      "rgba(255, 255, 255, ",  // Crisp white
      "rgba(200, 230, 205, ",  // Soft sage white
      "rgba(192, 132, 252, ",  // Subtle spark purple
      "rgba(251, 191, 36, ",   // Warm gold spark
    ];

    const createParticle = (centerX?: number, centerY?: number, isBurst = false): Particle => {
      const cx = centerX ?? width / 2;
      const cy = centerY ?? height / 2;
      const angle = Math.random() * Math.PI * 2;
      const dist = isBurst ? Math.random() * 40 : Math.random() * (Math.min(width, height) * 0.45);
      const colorBase = isBurst
        ? colors[Math.random() < 0.6 ? 6 : 5]
        : colors[Math.floor(Math.random() * colors.length)];

      const speed = isBurst ? 2.5 + Math.random() * 3.5 : 0.6 + Math.random() * 1.8;
      const size = isBurst ? 1.2 + Math.random() * 2.2 : 1.4 + Math.random() * 2.8;

      return {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: Math.cos(angle + (isBurst ? 0 : Math.PI / 2)) * speed,
        vy: Math.sin(angle + (isBurst ? 0 : Math.PI / 2)) * speed,
        size,
        color: colorBase,
        alpha: 0.1,
        targetAlpha: 0.4 + Math.random() * 0.55,
        angle,
        speed,
        life: 0,
        maxLife: isBurst ? 40 + Math.random() * 30 : 120 + Math.random() * 180,
        history: [],
        isSpark: isBurst,
      };
    };

    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push(createParticle());
    }

    let time = 0;
    let burstTimer = 0;
    let scanlineY = 0;

    const render = () => {
      time += 0.02;
      burstTimer++;

      // Occasional burst of energy
      if (burstTimer % 75 === 0 && particles.length < particleCount + 60) {
        const bx = width * (0.25 + Math.random() * 0.5);
        const by = height * (0.25 + Math.random() * 0.5);
        for (let b = 0; b < 18; b++) {
          particles.push(createParticle(bx, by, true));
        }
      }

      // 1. Dark generative canvas background with faint trail fading
      ctx.fillStyle = "rgba(10, 10, 12, 0.24)";
      ctx.fillRect(0, 0, width, height);

      // 2. Ambient radial background glow in center
      const cx = width / 2;
      const cy = height / 2;
      const radGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.min(width, height) * 0.65);
      radGlow.addColorStop(0, "rgba(72, 160, 76, 0.12)");
      radGlow.addColorStop(0.5, "rgba(72, 160, 76, 0.03)");
      radGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = radGlow;
      ctx.fillRect(0, 0, width, height);

      // 3. Sweeping light scanline / rasterizer
      scanlineY = (scanlineY + 1.8) % (height + 120);
      const curScanY = scanlineY - 60;
      const scanGrad = ctx.createLinearGradient(0, curScanY - 30, 0, curScanY + 30);
      scanGrad.addColorStop(0, "rgba(72, 160, 76, 0)");
      scanGrad.addColorStop(0.5, "rgba(72, 160, 76, 0.14)");
      scanGrad.addColorStop(0.55, "rgba(255, 255, 255, 0.22)");
      scanGrad.addColorStop(0.6, "rgba(72, 160, 76, 0.14)");
      scanGrad.addColorStop(1, "rgba(72, 160, 76, 0)");
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, curScanY - 30, width, 60);

      // 4. Update and draw particles
      const convergenceFactor = Math.min(1, time * 0.05); // gradually converge over time

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;

        // Curl noise / vortex flow field calculation
        const dx = p.x - cx;
        const dy = p.y - cy;
        const distToCenter = Math.sqrt(dx * dx + dy * dy) || 1;
        const currentAngle = Math.atan2(dy, dx);

        // Swirling force + inward convergence
        const swirlAngle = currentAngle + Math.PI / 2 + Math.sin(time + distToCenter * 0.03) * 0.3;
        const swirlForce = 0.45 * p.speed;
        const pullForce = (0.12 + convergenceFactor * 0.18) * (distToCenter > 180 ? 1 : -0.2);

        p.vx += Math.cos(swirlAngle) * swirlForce - (dx / distToCenter) * pullForce;
        p.vy += Math.sin(swirlAngle) * swirlForce - (dy / distToCenter) * pullForce;

        // Damping / friction
        p.vx *= 0.92;
        p.vy *= 0.92;

        p.x += p.vx;
        p.y += p.vy;

        // Alpha fade in & out
        if (p.life < 20) {
          p.alpha += (p.targetAlpha - p.alpha) * 0.1;
        } else if (p.life > p.maxLife - 25) {
          p.alpha *= 0.9;
        }

        // Keep position history for brush-like trailing stroke
        p.history.push({ x: p.x, y: p.y });
        if (p.history.length > 5) {
          p.history.shift();
        }

        // Draw brush-stroke trail
        if (p.history.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.history[0].x, p.history[0].y);
          for (let h = 1; h < p.history.length; h++) {
            ctx.lineTo(p.history[h].x, p.history[h].y);
          }
          ctx.strokeStyle = `${p.color}${p.alpha * 0.65})`;
          ctx.lineWidth = p.size * (p.isSpark ? 0.75 : 1.1);
          ctx.lineCap = "round";
          ctx.stroke();
        }

        // Draw particle head
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.fill();

        // Respawn if expired or out of bounds
        if (p.life >= p.maxLife || p.x < -30 || p.x > width + 30 || p.y < -30 || p.y > height + 30) {
          if (particles.length > particleCount) {
            particles.splice(i, 1);
          } else {
            particles[i] = createParticle();
          }
        }
      }

      // 5. Holographic geometric framing lines
      ctx.strokeStyle = "rgba(72, 160, 76, 0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(16, 16, width - 32, height - 32);

      // Corner accent brackets
      const cornerLen = 14;
      ctx.strokeStyle = "rgba(82, 184, 87, 0.65)";
      ctx.lineWidth = 1.8;

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(14, 14 + cornerLen);
      ctx.lineTo(14, 14);
      ctx.lineTo(14 + cornerLen, 14);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(width - 14 - cornerLen, 14);
      ctx.lineTo(width - 14, 14);
      ctx.lineTo(width - 14, 14 + cornerLen);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(14, height - 14 - cornerLen);
      ctx.lineTo(14, height - 14);
      ctx.lineTo(14 + cornerLen, height - 14);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(width - 14 - cornerLen, height - 14);
      ctx.lineTo(width - 14, height - 14);
      ctx.lineTo(width - 14, height - 14 - cornerLen);
      ctx.stroke();

      if (!isResolved) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [isResolved]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full aspect-square max-w-lg rounded-2xl overflow-hidden bg-[#0a0a0c] border border-zinc-800/90 shadow-2xl flex flex-col items-center justify-between select-none ${className}`}
    >
      {/* Generative Particle Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover z-0 rounded-2xl"
      />

      {/* Top Meta Tag */}
      <div className="relative z-10 w-full p-4 flex items-center justify-between">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs font-semibold shadow-xs">
          <Wand2 className="w-3.5 h-3.5 text-[#52b857] animate-spin" style={{ animationDuration: "3s" }} />
          <span>{mediaType === "video" ? "Zen Motion Studio" : "Zen Design Canvas"}</span>
        </div>

        <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-zinc-300 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-[#48A04C] animate-ping" />
          <span>{elapsedSeconds}s</span>
        </div>
      </div>

      {/* Center Subtle Neural Grid / Shimmer Badge */}
      <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#48A04C]/15 border border-[#48A04C]/40 backdrop-blur-md flex items-center justify-center shadow-lg shadow-[#48A04C]/10 mb-3 animate-pulse">
          <Sparkles className="w-6 h-6 text-[#52b857]" />
        </div>
        <p className="text-xs font-mono uppercase tracking-widest text-[#52b857] font-semibold">
          Neural Synthesis
        </p>
        <p className="text-xs text-zinc-400 mt-1 max-w-[280px] truncate italic">
          "{prompt}"
        </p>
      </div>

      {/* Bottom Shimmering Status Bar */}
      <div className="relative z-10 w-full p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <div className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-zinc-900/80 backdrop-blur-md border border-zinc-800/80">
          <div className="flex items-center space-x-2.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-[#48A04C] animate-pulse shrink-0" />
            <span className="text-xs sm:text-sm font-medium text-zinc-200 truncate tracking-tight animate-pulse">
              {PHRASES[currentPhraseIdx]}
            </span>
          </div>

          <div className="hidden sm:flex items-center space-x-1 shrink-0 pl-2">
            {PHRASES.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentPhraseIdx
                    ? "w-4 bg-[#52b857]"
                    : idx < currentPhraseIdx
                    ? "w-2 bg-[#48A04C]/60"
                    : "w-1.5 bg-zinc-700"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
