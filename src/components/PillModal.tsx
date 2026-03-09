"use client";

import { useEffect, useRef, useMemo } from "react";

interface PillModalProps {
  rabbitCompleted: boolean;
  onRedPill: () => void;
  onBluePill: () => void;
  onClose: () => void;
}

export default function PillModal({ rabbitCompleted, onRedPill, onBluePill, onClose }: PillModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Pre-compute matrix rain characters to avoid hydration mismatch
  const rainColumns = useMemo(() =>
    Array.from({ length: 20 }, (_, i) =>
      Array.from({ length: 30 }, (_, j) =>
        String.fromCharCode(0x30a0 + ((i * 31 + j * 17 + 7) % 96))
      )
    ), []);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (overlayRef.current) overlayRef.current.style.opacity = "1";
    });
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-500"
      style={{ opacity: 0 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/85" />

      {/* Matrix rain effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-10">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute text-[10px] leading-3 font-mono"
            style={{
              left: `${(i / 20) * 100}%`,
              color: "#00ff41",
              animation: `matrixRain ${3 + (i % 4)}s linear infinite`,
              animationDelay: `${(i * 0.3) % 3}s`,
            }}
          >
            {rainColumns[i].map((char, j) => (
              <div key={j}>{char}</div>
            ))}
          </div>
        ))}
      </div>

      {/* Content */}
      <div
        className="relative flex flex-col items-center gap-8 px-4"
        style={{ animation: "pillFadeIn 0.5s ease-out both" }}
      >
        {/* Title */}
        <h2
          className="font-pixel text-[14px] sm:text-[18px] tracking-wider text-center"
          style={{ color: "#00ff41" }}
        >
          MAKE YOUR CHOICE
        </h2>

        {/* Pills container */}
        <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-12">
          {/* Red Pill */}
          <button
            onClick={onRedPill}
            className="group flex flex-col items-center gap-3 cursor-pointer transition-transform duration-200 hover:scale-110"
          >
            <div
              className="relative w-20 h-12 sm:w-24 sm:h-14 rounded-full"
              style={{
                background: "#cc0000",
                border: "3px solid #ff3333",
                boxShadow:
                  "4px 4px 0px #550000, 0 0 24px rgba(255, 0, 0, 0.25), inset -3px -3px 0px #880000, inset 3px 3px 0px #ee2222",
              }}
            >
              {/* Pixel highlight blocks */}
              <div className="absolute top-1 left-2.5 w-2.5 h-1" style={{ background: "#ff6666" }} />
              <div className="absolute top-1 left-5.5 w-1.5 h-0.75" style={{ background: "#ff4444" }} />
            </div>
            <span className="font-pixel text-[10px] sm:text-[12px] uppercase tracking-wider text-red-400 group-hover:text-red-300 transition-colors">
              The truth
            </span>
          </button>

          {/* Divider */}
          <span
            className="font-pixel text-[12px] sm:text-[14px]"
            style={{ color: "#00ff41", opacity: 0.4 }}
          >
            OR
          </span>

          {/* Blue Pill */}
          <button
            onClick={() => { if (!rabbitCompleted) onBluePill(); }}
            className={`group flex flex-col items-center gap-3 transition-transform duration-200 ${
              !rabbitCompleted ? "cursor-pointer hover:scale-110" : "cursor-default"
            }`}
          >
            <div
              className="relative w-20 h-12 sm:w-24 sm:h-14 rounded-full"
              style={{
                background: rabbitCompleted ? "#1a3322" : "#2266cc",
                border: `3px solid ${rabbitCompleted ? "#2a5533" : "#4499ff"}`,
                boxShadow: rabbitCompleted
                  ? "4px 4px 0px #0a1520, inset -3px -3px 0px #1a2a3a, inset 3px 3px 0px #2a3a4a"
                  : "4px 4px 0px #0a2244, 0 0 24px rgba(68, 136, 255, 0.25), inset -3px -3px 0px #114488, inset 3px 3px 0px #3377dd",
                opacity: rabbitCompleted ? 0.5 : 1,
              }}
            >
              {/* Pixel highlight blocks */}
              <div
                className="absolute top-1 left-2.5 w-2.5 h-1"
                style={{ background: rabbitCompleted ? "#3a4a5a" : "#6699ff" }}
              />
              <div
                className="absolute top-1 left-5.5 w-1.5 h-0.75"
                style={{ background: rabbitCompleted ? "#2a3a4a" : "#4488ee" }}
              />
              {rabbitCompleted && (
                <div
                  className="absolute inset-0 flex items-center justify-center font-pixel text-[10px]"
                  style={{ color: "#00ff41" }}
                >
                  FOUND
                </div>
              )}
            </div>
            <span
              className={`font-pixel text-[10px] sm:text-[12px] uppercase tracking-wider transition-colors ${
                rabbitCompleted
                  ? "text-green-600"
                  : "text-blue-400 group-hover:text-blue-300"
              }`}
            >
              {rabbitCompleted ? "Already found" : "The rabbit hole"}
            </span>
          </button>
        </div>

        {/* Close hint */}
        <p className="font-pixel text-[8px] text-gray-600 tracking-wider mt-4">
          ESC TO CLOSE
        </p>
      </div>

      {/* Keyframes */}
      <style jsx>{`
        @keyframes matrixRain {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes pillFadeIn {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
