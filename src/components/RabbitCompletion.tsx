"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface RabbitCompletionProps {
  onComplete: () => void;
}

const LINE_1 = "You found the white rabbit. | 你发现了白色的兔子。";
const LINE_2 = "Welcome to the other side. | 欢迎来到另一边。";
const CHAR_DELAY = 50;

export default function RabbitCompletion({ onComplete }: RabbitCompletionProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<"glitch" | "fade" | "type1" | "type2" | "redirect">("glitch");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const charIdx = useRef(0);
  const mountTime = useRef(Date.now());

  // Phase transitions
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    // 0s: glitch (0.5s)
    timers.push(setTimeout(() => setPhase("fade"), 500));

    // 0.5s: fade to black (1s)
    timers.push(setTimeout(() => setPhase("type1"), 1500));

    // 7s: redirect
    timers.push(setTimeout(() => {
      setPhase("redirect");
      router.push("/rabbit");
      onComplete();
    }, 7000));

    return () => timers.forEach(clearTimeout);
  }, [router, onComplete]);

  // Typing effect for line 1 (starts at 1.5s)
  useEffect(() => {
    if (phase !== "type1") return;
    charIdx.current = 0;

    const interval = setInterval(() => {
      charIdx.current++;
      setLine1(LINE_1.slice(0, charIdx.current));
      if (charIdx.current >= LINE_1.length) {
        clearInterval(interval);
        // Start line 2 after short pause
        setTimeout(() => setPhase("type2"), 500);
      }
    }, CHAR_DELAY);

    return () => clearInterval(interval);
  }, [phase]);

  // Typing effect for line 2 (starts after line 1)
  useEffect(() => {
    if (phase !== "type2") return;
    charIdx.current = 0;

    const interval = setInterval(() => {
      charIdx.current++;
      setLine2(LINE_2.slice(0, charIdx.current));
      if (charIdx.current >= LINE_2.length) {
        clearInterval(interval);
      }
    }, CHAR_DELAY);

    return () => clearInterval(interval);
  }, [phase]);

  // Blinking cursor
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none" style={{ fontFamily: "'Silkscreen', monospace" }}>
      {/* Glitch effect */}
      {phase === "glitch" && (
        <div
          className="absolute inset-0"
          style={{
            animation: "rabbitGlitch 0.5s linear",
            background: "rgba(0,255,65,0.05)",
          }}
        />
      )}

      {/* Fade to black overlay */}
      <div
        className="absolute inset-0 bg-black transition-opacity"
        style={{
          transitionDuration: "1s",
          opacity: phase === "glitch" ? 0 : 1,
        }}
      />

      {/* Typed text */}
      {(phase === "type1" || phase === "type2" || phase === "redirect") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-4">
          <p
            className="text-[14px] sm:text-[18px] tracking-widest text-center"
            style={{
              color: "#00ff41",
              textShadow: "0 0 15px rgba(0,255,65,0.5), 0 0 30px rgba(0,255,65,0.2)",
              minHeight: "1.5em",
            }}
          >
            {line1}
            {phase === "type1" && <span style={{ opacity: showCursor ? 1 : 0 }}>_</span>}
          </p>
          {(phase === "type2" || phase === "redirect") && (
            <p
              className="text-[14px] sm:text-[18px] tracking-widest text-center"
              style={{
                color: "#00ff41",
                textShadow: "0 0 15px rgba(0,255,65,0.5), 0 0 30px rgba(0,255,65,0.2)",
                minHeight: "1.5em",
              }}
            >
              {line2}
              {phase === "type2" && <span style={{ opacity: showCursor ? 1 : 0 }}>_</span>}
            </p>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes rabbitGlitch {
          0% { transform: translate(0, 0) skewX(0deg); filter: hue-rotate(0deg); }
          10% { transform: translate(-3px, 2px) skewX(-2deg); filter: hue-rotate(90deg); }
          20% { transform: translate(3px, -1px) skewX(3deg); filter: hue-rotate(180deg); }
          30% { transform: translate(-2px, 3px) skewX(-1deg); filter: hue-rotate(270deg); }
          40% { transform: translate(1px, -2px) skewX(2deg); filter: hue-rotate(45deg); }
          50% { transform: translate(-3px, 1px) skewX(-3deg); filter: hue-rotate(135deg); }
          60% { transform: translate(2px, -3px) skewX(1deg); filter: hue-rotate(225deg); }
          70% { transform: translate(-1px, 2px) skewX(-2deg); filter: hue-rotate(315deg); }
          80% { transform: translate(3px, -1px) skewX(3deg); filter: hue-rotate(60deg); }
          90% { transform: translate(-2px, 3px) skewX(-1deg); filter: hue-rotate(150deg); }
          100% { transform: translate(0, 0) skewX(0deg); filter: hue-rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
