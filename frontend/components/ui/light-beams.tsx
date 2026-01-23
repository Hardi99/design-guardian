"use client";

import { cn } from "@/lib/utils";

interface LightBeamsProps {
  className?: string;
  beamCount?: number;
}

export function LightBeams({ className, beamCount = 6 }: LightBeamsProps) {
  const beams = [
    { width: 960, height: 24, top: 48, left: 0, delay: 0, duration: 8 },
    { width: 960, height: 24, top: -48, left: -112, delay: -1, duration: 15 },
    { width: 960, height: 16, top: 144, left: 320, delay: -2, duration: 7 },
    { width: 960, height: 64, top: 820, left: 176, delay: 0, duration: 10 },
    { width: 480, height: 12, top: 970, left: 550, delay: -2, duration: 15 },
    { width: 960, height: 16, top: 820, left: 96, delay: -3, duration: 9 },
  ];

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
      aria-hidden="true"
    >
      {beams.slice(0, beamCount).map((beam, index) => (
        <div
          key={index}
          className="light-beam"
          style={{
            width: beam.width,
            height: beam.height,
            top: beam.top,
            left: beam.left,
            animation: `swing ${beam.duration}s ${beam.delay}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}
