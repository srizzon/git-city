"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const ETH_ADDRESS = "0x8C24A2b54128bC0717F533E6DA7338be30b9f732";

// 多语言文案配置
type Lang = "en" | "pt" | "zh";
const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  en: {
    thanksBannerTitle: "THANK YOU FOR YOUR SUPPORT",
    thanksBannerDesc: "Your contribution keeps the city running. You are a real one.",
    headerTitle: "> KEEP THE SIGNAL ALIVE",
    headerDesc: "Git City runs on servers, databases, and API calls. Every new building that goes up, the cost goes up with it. Your support keeps this city running.",
    stripeTitle: "01 // ONE-TIME SUPPORT",
    githubTitle: "02 // GITHUB SPONSORS",
    cryptoTitle: "03 // CRYPTO (ETH)",
    backLink: "< BACK TO CITY",
    copyBtn: "COPY",
    copiedBtn: "COPIED",
    goBtn: "GO",
    errorGeneric: "Something went wrong",
    errorConnect: "Failed to connect. Try again.",
  },
  pt: {
    thanksBannerTitle: "OBRIGADO PELO SEU APOIO",
    thanksBannerDesc: "Sua contribuição mantém a cidade funcionando. Você é um de verdade.",
    headerTitle: "> MANTER O SINAL ATIVO",
    headerDesc: "A Git City funciona com servidores, bancos de dados e chamadas de API. Cada novo prédio que surge, o custo aumenta junto. Seu apoio mantém essa cidade funcionando.",
    stripeTitle: "01 // APOIO ÚNICO",
    githubTitle: "02 // GITHUB SPONSORS",
    cryptoTitle: "03 // CRIPTO (ETH)",
    backLink: "< VOLTAR PARA A CIDADE",
    copyBtn: "COPIAR",
    copiedBtn: "COPIADO",
    goBtn: "IR",
    errorGeneric: "Algo deu errado",
    errorConnect: "Falha na conexão. Tente novamente.",
  },
  zh: {
    thanksBannerTitle: "感谢你的支持",
    thanksBannerDesc: "你的捐助让这座城市得以运转。你是真正的建设者。",
    headerTitle: "> 维持信号运转",
    headerDesc: "Git 之城依赖服务器、数据库和 API 调用运行。每新增一座建筑，成本就会随之增加。你的支持让这座城市得以存续。",
    stripeTitle: "01 // 一次性支持",
    githubTitle: "02 // GitHub 赞助",
    cryptoTitle: "03 // 加密货币 (ETH)",
    backLink: "< 返回城市",
    copyBtn: "复制",
    copiedBtn: "已复制",
    goBtn: "确认",
    errorGeneric: "出了点小问题",
    errorConnect: "连接失败，请重试。",
  },
};

function SupportContent() {
  const searchParams = useSearchParams();
  const thanks = searchParams.get("thanks") === "true";

  // 新增语言状态管理
  const [lang, setLang] = useState<Lang>("en");
  const [copied, setCopied] = useState(false);
  const [loadingAmount, setLoadingAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 获取当前语言的文案
  const t = TRANSLATIONS[lang];

  const copyEth = async () => {
    await navigator.clipboard.writeText(ETH_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStripeCheckout = async (amount: number) => {
    if (loadingAmount) return;
    setError(null);
    setLoadingAmount(amount);

    try {
      const res = await fetch("/api/support/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t.errorGeneric);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError(t.errorConnect);
    } finally {
      setLoadingAmount(null);
    }
  };

  // 切换语言的方法
  const switchLang = (newLang: Lang) => {
    setLang(newLang);
    setError(null); // 切换语言时清空错误提示
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{
        background: "#0a0a0a",
        fontFamily: "'Silkscreen', monospace",
      }}
    >
      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.015) 2px, rgba(0,255,65,0.015) 4px)",
        }}
      />

      {/* 新增语言切换按钮 - 固定在右上角 */}
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

      <div className="relative z-20 w-full max-w-lg flex flex-col gap-10">
        {/* Thank you banner */}
        {thanks && (
          <div
            className="flex flex-col gap-2 p-5"
            style={{
              border: "2px solid #00ff41",
              background: "rgba(0, 255, 65, 0.08)",
              boxShadow: "0 0 20px rgba(0, 255, 65, 0.15)",
            }}
          >
            <span
              className="font-pixel text-[12px] sm:text-[14px] tracking-wider"
              style={{ color: "#00ff41" }}
            >
              {t.thanksBannerTitle}
            </span>
            <span
              className="font-pixel text-[9px] sm:text-[10px]"
              style={{ color: "rgba(0, 255, 65, 0.6)" }}
            >
              {t.thanksBannerDesc}
            </span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col gap-3">
          <h1
            className="font-pixel text-[16px] sm:text-[20px] tracking-wider"
            style={{ color: "#00ff41" }}
          >
            {t.headerTitle}
          </h1>
          <p
            className="font-pixel text-[9px] sm:text-[10px] leading-relaxed"
            style={{ color: "rgba(0, 255, 65, 0.5)" }}
          >
            {t.headerDesc}
          </p>
        </div>

        {/* Stripe */}
        <div
          className="flex flex-col gap-3 p-5"
          style={{
            border: "2px solid rgba(0, 255, 65, 0.2)",
            background: "rgba(0, 255, 65, 0.02)",
            boxShadow: "4px 4px 0px rgba(0, 255, 65, 0.08)",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="font-pixel text-[11px] sm:text-[12px] tracking-wider"
              style={{ color: "#00ff41" }}
            >
              {t.stripeTitle}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            {[5, 10, 25].map((amount) => (
              <button
                key={amount}
                disabled={loadingAmount !== null}
                onClick={() => handleStripeCheckout(amount)}
                className="font-pixel text-[11px] sm:text-[12px] px-5 py-2.5 tracking-wider transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                style={{
                  color: "#00ff41",
                  border: "2px solid rgba(0, 255, 65, 0.35)",
                  background: "rgba(0, 255, 65, 0.05)",
                  boxShadow: "3px 3px 0px rgba(0, 255, 65, 0.12)",
                }}
                onMouseEnter={(e) => {
                  if (!loadingAmount) {
                    e.currentTarget.style.background = "rgba(0, 255, 65, 0.15)";
                    e.currentTarget.style.borderColor = "#00ff41";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(0, 255, 65, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(0, 255, 65, 0.35)";
                }}
              >
                {loadingAmount === amount ? "..." : `$${amount}`}
              </button>
            ))}
            <div className="flex items-center gap-2">
              <span
                className="font-pixel text-[11px] sm:text-[12px]"
                style={{ color: "rgba(0, 255, 65, 0.5)" }}
              >
                $
              </span>
              <input
                type="number"
                min={1}
                placeholder="__"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customAmount) {
                    handleStripeCheckout(parseInt(customAmount, 10));
                  }
                }}
                className="font-pixel text-[11px] sm:text-[12px] w-16 px-2 py-2 tracking-wider outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                style={{
                  color: "#00ff41",
                  border: "2px solid rgba(0, 255, 65, 0.35)",
                  background: "rgba(0, 255, 65, 0.02)",
                }}
              />
              <button
                disabled={loadingAmount !== null || !customAmount || parseInt(customAmount, 10) < 1}
                onClick={() => handleStripeCheckout(parseInt(customAmount, 10))}
                className="font-pixel text-[9px] sm:text-[10px] px-3 py-2.5 tracking-wider transition-all duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  color: "#00ff41",
                  border: "2px solid rgba(0, 255, 65, 0.35)",
                  background: "rgba(0, 255, 65, 0.05)",
                  boxShadow: "3px 3px 0px rgba(0, 255, 65, 0.12)",
                }}
                onMouseEnter={(e) => {
                  if (!loadingAmount && customAmount) {
                    e.currentTarget.style.background = "rgba(0, 255, 65, 0.15)";
                    e.currentTarget.style.borderColor = "#00ff41";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(0, 255, 65, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(0, 255, 65, 0.35)";
                }}
              >
                {loadingAmount && loadingAmount !== 5 && loadingAmount !== 10 && loadingAmount !== 25 ? "..." : t.goBtn}
              </button>
            </div>
          </div>
          {error && (
            <span
              className="font-pixel text-[9px] sm:text-[10px]"
              style={{ color: "#ff4141" }}
            >
              {error}
            </span>
          )}
        </div>

        {/* GitHub Sponsors */}
        <div
          className="flex flex-col gap-3 p-5"
          style={{
            border: "2px solid rgba(0, 255, 65, 0.2)",
            background: "rgba(0, 255, 65, 0.02)",
            boxShadow: "4px 4px 0px rgba(0, 255, 65, 0.08)",
          }}
        >
          <span
            className="font-pixel text-[11px] sm:text-[12px] tracking-wider"
            style={{ color: "#00ff41" }}
          >
            {t.githubTitle}
          </span>
          <a
            href="https://github.com/sponsors/srizzon"
            target="_blank"
            rel="noopener noreferrer"
            className="font-pixel text-[10px] sm:text-[11px] px-5 py-2.5 tracking-wider transition-all duration-200 cursor-pointer inline-block w-fit"
            style={{
              color: "#00ff41",
              border: "2px solid rgba(0, 255, 65, 0.35)",
              background: "rgba(0, 255, 65, 0.05)",
              boxShadow: "3px 3px 0px rgba(0, 255, 65, 0.12)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0, 255, 65, 0.15)";
              e.currentTarget.style.borderColor = "#00ff41";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(0, 255, 65, 0.05)";
              e.currentTarget.style.borderColor = "rgba(0, 255, 65, 0.35)";
            }}
          >
            github.com/sponsors/srizzon
          </a>
        </div>

        {/* Crypto */}
        <div
          className="flex flex-col gap-3 p-5"
          style={{
            border: "2px solid rgba(0, 255, 65, 0.2)",
            background: "rgba(0, 255, 65, 0.02)",
            boxShadow: "4px 4px 0px rgba(0, 255, 65, 0.08)",
          }}
        >
          <span
            className="font-pixel text-[11px] sm:text-[12px] tracking-wider"
            style={{ color: "#00ff41" }}
          >
            {t.cryptoTitle}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <code
              className="font-pixel text-[7px] sm:text-[8px] break-all"
              style={{ color: "rgba(0, 255, 65, 0.6)" }}
            >
              {ETH_ADDRESS}
            </code>
            <button
              onClick={copyEth}
              className="font-pixel text-[9px] px-3 py-1.5 shrink-0 cursor-pointer transition-all duration-200"
              style={{
                color: copied ? "#0a0a0a" : "#00ff41",
                border: "2px solid rgba(0, 255, 65, 0.35)",
                background: copied ? "#00ff41" : "rgba(0, 255, 65, 0.05)",
                boxShadow: "2px 2px 0px rgba(0, 255, 65, 0.12)",
              }}
              onMouseEnter={(e) => {
                if (!copied) {
                  e.currentTarget.style.background = "rgba(0, 255, 65, 0.15)";
                  e.currentTarget.style.borderColor = "#00ff41";
                }
              }}
              onMouseLeave={(e) => {
                if (!copied) {
                  e.currentTarget.style.background = "rgba(0, 255, 65, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(0, 255, 65, 0.35)";
                }
              }}
            >
              {copied ? t.copiedBtn : t.copyBtn}
            </button>
          </div>
        </div>

        {/* Back link */}
        <Link
          href="/"
          className="font-pixel text-[9px] sm:text-[10px] tracking-wider transition-colors duration-200"
          style={{ color: "rgba(0, 255, 65, 0.35)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#00ff41")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(0, 255, 65, 0.35)")}
        >
          {t.backLink}
        </Link>
      </div>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense>
      <SupportContent />
    </Suspense>
  );
}