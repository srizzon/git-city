"use client";

import { useEffect, useRef, useMemo, useState } from "react";

interface PillModalProps {
  rabbitCompleted: boolean;
  onRedPill: () => void;
  onBluePill: () => void;
  onClose: () => void;
}

// 多语言文案配置
type Lang = "en" | "pt" | "zh";
const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  en: {
    title: "MAKE YOUR CHOICE",
    redPillLabel: "The truth",
    divider: "OR",
    bluePillLabelReady: "The rabbit hole",
    bluePillLabelCompleted: "Already found",
    bluePillLabelNotLoggedIn: "You're not ready yet",
    bluePillLabelNotClaimed: "Claim your building first",
    lockedText: "LOCKED",
    foundText: "FOUND",
    closeHint: "ESC TO CLOSE",
  },
  pt: {
    title: "FAÇA SUA ESCOLHA",
    redPillLabel: "A verdade",
    divider: "OU",
    bluePillLabelReady: "O buraco do coelho",
    bluePillLabelCompleted: "Já encontrado",
    bluePillLabelNotLoggedIn: "Você ainda não está pronto",
    bluePillLabelNotClaimed: "Reivindique seu prédio primeiro",
    lockedText: "TRANCADO",
    foundText: "ENCONTRADO",
    closeHint: "ESC PARA FECHAR",
  },
  zh: {
    title: "做出你的选择",
    redPillLabel: "真相",
    divider: "或者",
    bluePillLabelReady: "兔子洞",
    bluePillLabelCompleted: "已找到",
    bluePillLabelNotLoggedIn: "你还没有准备好",
    bluePillLabelNotClaimed: "先认领你的建筑",
    lockedText: "已锁定",
    foundText: "已找到",
    closeHint: "按 ESC 关闭",
  },
};

export default function PillModal({ isLoggedIn, hasClaimed, rabbitCompleted, onRedPill, onBluePill, onClose }: PillModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  // 新增语言状态（默认英文，和其他组件保持一致）
  const [lang, setLang] = useState<Lang>("en");
  // 获取当前语言文案
  const t = TRANSLATIONS[lang];

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

    // 监听ESC键关闭弹窗
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // 切换语言方法
  const switchLang = (newLang: Lang) => {
    setLang(newLang);
  };

  // 计算蓝药丸状态相关
  const canClickBluePill = isLoggedIn && hasClaimed && !rabbitCompleted;
  const isLocked = !isLoggedIn || !hasClaimed;
  const getBluePillLabel = () => {
    if (rabbitCompleted) return t.bluePillLabelCompleted;
    if (!isLoggedIn) return t.bluePillLabelNotLoggedIn;
    if (!hasClaimed) return t.bluePillLabelNotClaimed;
    return t.bluePillLabelReady;
  };

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

      {/* 新增语言切换按钮 - 固定右上角 */}
      <div className="fixed top-4 right-4 z-30 flex items-center gap-1">
        {(["en", "pt", "zh"] as Lang[]).map((language) => (
          <button
            key={language}
            onClick={() => switchLang(language)}
            className="font-pixel text-[9px] px-2 py-0.5 cursor-pointer transition-colors"
            style={{
              color: lang === language ? "#00ff41" : "rgba(0, 255, 65, 0.25)",
              background: lang === language ? "rgba(0, 255, 65, 0.1)" : "transparent",
              border: `1px solid ${lang === language ? "rgba(0, 255, 65, 0.3)" : "transparent"}`,
            }}
          >
            {language.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Matrix rain effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-10">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute text-[10px] leading-[12px] font-mono"
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
        {/* Title - 纯当前语言文案 */}
        <h2
          className="font-pixel text-[14px] sm:text-[18px] tracking-wider text-center"
          style={{ color: "#00ff41" }}
        >
          {t.title}
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
              <div className="absolute top-[4px] left-[10px] w-[10px] h-[4px]" style={{ background: "#ff6666" }} />
              <div className="absolute top-[4px] left-[22px] w-[6px] h-[3px]" style={{ background: "#ff4444" }} />
            </div>
            <span className="font-pixel text-[10px] sm:text-[12px] uppercase tracking-wider text-red-400 group-hover:text-red-300 transition-colors">
              {t.redPillLabel}
            </span>
          </button>

          {/* Divider - 纯当前语言文案 */}
          <span
            className="font-pixel text-[12px] sm:text-[14px]"
            style={{ color: "#00ff41", opacity: 0.4 }}
          >
            {t.divider}
          </span>

          {/* Blue Pill */}
          <button
            onClick={() => {
              if (canClickBluePill) onBluePill();
            }}
            className={`group flex flex-col items-center gap-3 transition-transform duration-200 ${canClickBluePill ? "cursor-pointer hover:scale-110" : "cursor-not-allowed"
              }`}
          >
            <div
              className="relative w-20 h-12 sm:w-24 sm:h-14 rounded-full"
              style={{
                background: canClickBluePill ? "#2266cc" : rabbitCompleted ? "#1a3322" : "#223344",
                border: `3px solid ${canClickBluePill ? "#4499ff" : rabbitCompleted ? "#2a5533" : "#334455"}`,
                boxShadow: canClickBluePill
                  ? "4px 4px 0px #0a2244, 0 0 24px rgba(68, 136, 255, 0.25), inset -3px -3px 0px #114488, inset 3px 3px 0px #3377dd"
                  : "4px 4px 0px #0a1520, inset -3px -3px 0px #1a2a3a, inset 3px 3px 0px #2a3a4a",
                opacity: canClickBluePill ? 1 : 0.5,
              }}
            >
              {/* Pixel highlight blocks */}
              <div
                className="absolute top-[4px] left-[10px] w-[10px] h-[4px]"
                style={{ background: canClickBluePill ? "#6699ff" : "#3a4a5a" }}
              />
              <div
                className="absolute top-[4px] left-[22px] w-[6px] h-[3px]"
                style={{ background: canClickBluePill ? "#4488ee" : "#2a3a4a" }}
              />
              {isLocked && (
                <div
                  className="absolute inset-0 flex items-center justify-center font-pixel text-[10px]"
                  style={{ color: "#556677" }}
                >
                  {t.lockedText}
                </div>
              )}
              {rabbitCompleted && (
                <div
                  className="absolute inset-0 flex items-center justify-center font-pixel text-[10px]"
                  style={{ color: "#00ff41" }}
                >
                  {t.foundText}
                </div>
              )}
            </div>
            <span
              className={`font-pixel text-[10px] sm:text-[12px] uppercase tracking-wider transition-colors ${canClickBluePill
                  ? "text-blue-400 group-hover:text-blue-300"
                  : rabbitCompleted
                    ? "text-green-600"
                    : "text-gray-600"
                }`}
            >
              {getBluePillLabel()}
            </span>
          </button>
        </div>

        {/* Close hint - 纯当前语言文案 */}
        <p className="font-pixel text-[10px] text-gray-600 tracking-wider mt-4">
          {t.closeHint}
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