"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase";

// ─── Types ──────────────────────────────────────────────────

interface Completer {
  position: number;
  login: string;
  avatar_url: string | null;
  name: string | null;
  completed_at: string;
}

interface UserRabbitData {
  progress: number;
  completed: boolean;
  completed_at: string | null;
}

// ─── Canvas Matrix Rain ─────────────────────────────────────
// Uses a single <canvas> for performance - no DOM thrashing

const KATAKANA = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";

function MatrixRainCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const fontSize = 14;
    let columns = 0;
    let drops: number[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Math.floor(canvas.width / fontSize);
      drops = Array.from({ length: columns }, () => Math.random() * -50);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#00ff41";
      ctx.font = `${fontSize}px monospace`;
      ctx.shadowColor = "#00ff41";
      ctx.shadowBlur = 4;

      for (let i = 0; i < columns; i++) {
        // Skip center 40% of screen to keep statue area clear
        const x = i * fontSize;
        const screenPct = x / canvas.width;
        if (screenPct > 0.3 && screenPct < 0.7) {
          // Dim center columns heavily
          ctx.globalAlpha = 0.05;
        } else {
          ctx.globalAlpha = 0.3 + Math.random() * 0.2;
        }

        const char = KATAKANA[Math.floor(Math.random() * KATAKANA.length)];
        ctx.fillText(char, x, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i] += 0.5 + Math.random() * 0.5;
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.5 }}
    />
  );
}

// ─── Pixel Rabbit Statue (canvas-drawn) ─────────────────────

function PixelRabbitStatue({ completed }: { completed: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 200;
    const H = 260;
    canvas.width = W;
    canvas.height = H;
    const PX = 8; // pixel size

    const bodyColor = completed ? "#e8e8e8" : "#2a2a2a";
    const bodyHi = completed ? "#ffffff" : "#333333";
    const bodyLo = completed ? "#cccccc" : "#222222";
    const eyeColor = completed ? "#ff0000" : "#444444";
    const pedColor = "#111111";

    let animId: number;
    let t = 0;

    const draw = () => {
      t += 0.02;
      ctx.clearRect(0, 0, W, H);

      // Glow behind statue (completers)
      if (completed) {
        const pulse = 0.15 + Math.sin(t * 2) * 0.05;
        const grad = ctx.createRadialGradient(W / 2, H / 2 - 10, 10, W / 2, H / 2 - 10, 100);
        grad.addColorStop(0, `rgba(255,255,255,${pulse})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      const cx = W / 2;
      const base = H - 30;

      const px = (x: number, y: number, w: number, h: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(cx + x * PX - (w * PX) / 2, base - y * PX - h * PX, w * PX, h * PX);
      };

      // Pedestal
      px(0, 0, 10, 2, pedColor);
      px(0, 0, 12, 1, "#0a0a0a");

      // Legs
      px(-2.5, 2, 2, 2, bodyLo);
      px(2.5, 2, 2, 2, bodyLo);
      px(-1, 2, 2, 2, bodyLo);
      px(1, 2, 2, 2, bodyLo);

      // Body
      px(0, 4, 6, 5, bodyColor);
      px(0, 5, 7, 3, bodyHi);

      // Tail
      px(-4, 5, 2, 2, bodyHi);

      // Head
      px(0, 9, 5, 4, bodyColor);
      px(0, 10, 6, 2, bodyHi);

      // Ears with subtle sway
      const earSway = Math.sin(t * 1.5) * 0.2;
      px(-1.5 + earSway, 13, 1.5, 5, bodyColor);
      px(1.5 - earSway, 13, 1.5, 5, bodyColor);
      // Ear inner
      if (completed) {
        px(-1.5 + earSway, 14, 0.8, 3, "#ffcccc");
        px(1.5 - earSway, 14, 0.8, 3, "#ffcccc");
      }

      // Eyes
      const eyeGlow = completed ? Math.sin(t * 3) * 0.3 + 0.7 : 0;
      ctx.fillStyle = eyeColor;
      if (completed) {
        ctx.shadowColor = "#ff0000";
        ctx.shadowBlur = 6 + eyeGlow * 8;
      }
      ctx.fillRect(cx - 1.5 * PX, base - 11 * PX, PX, PX);
      ctx.fillRect(cx + 0.5 * PX, base - 11 * PX, PX, PX);
      ctx.shadowBlur = 0;

      // Nose
      px(0, 10, 0.5, 0.5, completed ? "#ffaaaa" : "#3a3a3a");

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => cancelAnimationFrame(animId);
  }, [completed]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={260}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

// ─── Floating Particles ─────────────────────────────────────

function FloatingParticlesCSS() {
  const particles = useMemo(() =>
    Array.from({ length: 15 }, () => ({
      left: `${15 + Math.random() * 70}%`,
      duration: 6 + Math.random() * 8,
      delay: Math.random() * 6,
      size: 2 + Math.random() * 2,
    })),
  []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: p.left,
            bottom: "-5px",
            width: p.size,
            height: p.size,
            background: "#ffffff",
            boxShadow: "0 0 4px rgba(255,255,255,0.5)",
            animation: `particleUp ${p.duration}s ease-out ${p.delay}s infinite`,
            opacity: 0,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes particleUp {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 0.5; }
          80% { opacity: 0.2; }
          100% { transform: translateY(-100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Orbiting Names Ring ────────────────────────────────────

function CompleterRing({ completers, currentLogin, completed }: { completers: Completer[]; currentLogin: string; completed: boolean }) {
  if (completers.length === 0) return null;

  const visible = completers.slice(0, 20);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
      <div
        className="absolute"
        style={{
          top: "50%",
          left: "50%",
          width: 0,
          height: 0,
          animation: "ringOrbit 40s linear infinite",
        }}
      >
        {visible.map((c, i) => {
          const angle = (i / visible.length) * 360;
          const isMe = c.login.toLowerCase() === currentLogin.toLowerCase();
          const displayName = completed ? (c.name || c.login) : "???";
          // Responsive radius
          const radius = typeof window !== "undefined" && window.innerWidth < 640 ? 120 : 180;

          return (
            <div
              key={c.login}
              className="absolute font-pixel whitespace-nowrap"
              style={{
                fontSize: isMe ? 11 : 9,
                color: isMe ? "#00ff41" : completed ? "#00882a" : "#333",
                textShadow: isMe ? "0 0 8px rgba(0,255,65,0.6)" : "none",
                transform: `rotate(${angle}deg) translateX(${radius}px) rotate(-${angle}deg)`,
                transformOrigin: "0 0",
              }}
            >
              {displayName}
            </div>
          );
        })}
      </div>
      <style jsx>{`
        @keyframes ringOrbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

function RabbitContent() {
  const [completers, setCompleters] = useState<Completer[]>([]);
  const [userData, setUserData] = useState<UserRabbitData | null>(null);
  const [currentLogin, setCurrentLogin] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabase();

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      const login = (
        session?.user?.user_metadata?.user_name ??
        session?.user?.user_metadata?.preferred_username ??
        ""
      ).toLowerCase();
      setCurrentLogin(login);

      if (session) {
        fetch("/api/rabbit?check=true")
          .then((r) => r.ok ? r.json() : null)
          .then((data) => { if (data) setUserData(data); })
          .catch(() => {});
      } else {
        setUserData({ progress: 0, completed: false, completed_at: null });
      }
    });

    fetch("/api/rabbit")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.completers) setCompleters(data.completers); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const completed = userData?.completed ?? false;
  const myPosition = completers.findIndex((c) => c.login.toLowerCase() === currentLogin.toLowerCase()) + 1;
  const completedDate = userData?.completed_at
    ? new Date(userData.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <p className="font-pixel text-[14px] tracking-widest" style={{ color: "#00ff41" }}>...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Layer 0: Matrix rain (canvas, behind everything) */}
      <MatrixRainCanvas />

      {/* Layer 1: Floating particles */}
      {completed && <FloatingParticlesCSS />}

      {/* Layer 2: Orbiting names */}
      <CompleterRing completers={completers} currentLogin={currentLogin} completed={completed} />

      {/* Layer 3: Content - flexbox column layout */}
      <div className="fixed inset-0 z-10 flex flex-col items-center" style={{ pointerEvents: "none" }}>

        {/* Top section */}
        <div className="flex flex-col items-center gap-2 pt-8 sm:pt-12">
          <p
            className="font-pixel text-[12px] sm:text-[16px] tracking-[0.3em]"
            style={{ color: "#00ff41", textShadow: "0 0 15px rgba(0,255,65,0.5)" }}
          >
            {">"} THE OTHER SIDE
          </p>
          <p
            className="font-pixel text-[9px] sm:text-[11px] tracking-widest"
            style={{ color: "#00ff41", opacity: 0.5 }}
          >
            {completers.length} citizen{completers.length !== 1 ? "s" : ""} {completers.length === 1 ? "has" : "have"} found the white rabbit
          </p>
        </div>

        {/* Center: statue */}
        <div className="flex-1 flex items-center justify-center">
          <PixelRabbitStatue completed={completed} />
        </div>

        {/* Info section (below statue) */}
        <div className="flex flex-col items-center gap-1 pb-4">
          {completed && myPosition > 0 && (
            <>
              <p
                className="font-pixel text-[11px] sm:text-[14px] tracking-widest whitespace-pre-line"
                style={{ color: "#00ff41", textShadow: "0 0 10px rgba(0,255,65,0.4)" }}
              >
                You were #{myPosition} to arrive \n 您是第 #{myPosition} 个到达的
              </p>
              {completedDate && (
                <p
                  className="font-pixel text-[9px] sm:text-[10px] tracking-widest"
                  style={{ color: "#00ff41", opacity: 0.4 }}
                >
                  {completedDate}
                </p>
              )}
            </>
          )}
          {!completed && (
            <>
              <p
                className="font-pixel text-[11px] sm:text-[13px] tracking-widest text-center whitespace-pre-line"
                style={{ color: "#555" }}
              >
                You haven&apos;t found the white rabbit yet. \n 您还没有找到白色的兔子。
              </p>
              <p
                className="font-pixel text-[9px] sm:text-[11px] tracking-widest text-center whitespace-pre-line"
                style={{ color: "#00ff41", opacity: 0.4 }}
              >
                Return to the spire. Make your choice. \n 返回尖峰，做出你的选择。
              </p>
            </>
          )}
        </div>

        {/* Bottom buttons */}
        <div className="flex flex-col items-center gap-3 pb-8 sm:pb-10" style={{ pointerEvents: "auto" }}>
          {completed && (
            <a
              href={`https://x.com/intent/tweet?text=${encodeURIComponent(
                myPosition
                  ? `I followed the white rabbit in Git City.\nCitizen #${myPosition} to find the other side.`
                  : `I followed the white rabbit in Git City.`
              )}&url=${encodeURIComponent("https://thegitcity.com/rabbit")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-pixel text-[10px] sm:text-[11px] tracking-widest px-5 py-2 border cursor-pointer transition-all hover:border-[#00ff41] hover:text-[#00ff41]"
              style={{
                color: "#aaaaaa",
                borderColor: "#444444",
                background: "rgba(0,0,0,0.7)",
              }}
            >
              SHARE ON X | 分享到X
            </a>
          )}
          <Link
            href="/"
            className="font-pixel text-[10px] sm:text-[11px] tracking-widest px-4 py-2 hover:opacity-80 transition-opacity"
            style={{ color: "#00ff41", textShadow: "0 0 8px rgba(0,255,65,0.3)" }}
          >
            {"<"} BACK TO CITY | 返回城市
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RabbitPage() {
  return (
    <Suspense>
      <RabbitContent />
    </Suspense>
  );
}
