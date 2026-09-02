import React, { useMemo } from "react";

export const CosmicBackground: React.FC = () => {
  // Generate a deterministic list of stars to prevent re-renders
  const stars = useMemo(() => {
    return Array.from({ length: 85 }).map((_, i) => ({
      id: i,
      top: `${(i * 17) % 100}%`,
      left: `${(i * 23 + 7) % 100}%`,
      size: `${1 + (i % 3) * 0.9}px`,
      opacity: 0.2 + (i % 5) * 0.15,
      duration: `${2 + (i % 4) * 1.2}s`,
      delay: `${(i % 7) * 0.5}s`,
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 bg-black">
      {/* Lightweight CSS keyframe animation for star twinkling */}
      <style>{`
        @keyframes cosmicTwinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.85); }
          50% { opacity: 0.95; transform: scale(1.2); }
        }
        .star-dot {
          animation-name: cosmicTwinkle;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
        }
      `}</style>

      {/* Scattered White Stars with Staggered Twinkle */}
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full bg-white star-dot"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            animationDuration: star.duration,
            animationDelay: star.delay,
            boxShadow: star.size === "2.8px" ? "0 0 5px rgba(255,255,255,0.85)" : "none",
          }}
        />
      ))}
    </div>
  );
};


