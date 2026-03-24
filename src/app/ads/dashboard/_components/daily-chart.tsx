"use client";

import { useRef, useEffect } from "react";

const ACCENT = "#c8e64a";
const CLICK_COLOR = "#64b5f6";
const CONV_COLOR = "#ff9800";

interface DailyData {
  day: string;
  impressions: number;
  clicks: number;
  conversions?: number;
}

interface Props {
  data: DailyData[];
}

export function DailyChart({ data }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padL = 55;
    const padR = 16;
    const padT = 20;
    const padB = 34;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    ctx.clearRect(0, 0, w, h);

    const maxImp = Math.max(...data.map((d) => d.impressions), 1);
    const maxClk = Math.max(...data.map((d) => d.clicks), 1);

    function drawLine(values: number[], max: number, color: string) {
      if (!ctx || values.length === 0) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      values.forEach((v, i) => {
        const x = padL + (i / Math.max(values.length - 1, 1)) * chartW;
        const y = padT + chartH - (v / max) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Grid lines
    ctx.strokeStyle = "#1c1c28";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (i / 4) * chartH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();

      // Y-axis labels (impressions scale)
      const val = Math.round(maxImp * (1 - i / 4));
      ctx.fillStyle = "#888";
      ctx.font = "11px monospace";
      ctx.textAlign = "right";
      ctx.fillText(val >= 1000 ? `${(val / 1000).toFixed(0)}K` : String(val), padL - 8, y + 4);
    }

    const convValues = data.map((d) => d.conversions ?? 0);
    const maxConv = Math.max(...convValues, 1);
    const hasConversions = convValues.some((v) => v > 0);

    drawLine(data.map((d) => d.impressions), maxImp, ACCENT);
    drawLine(data.map((d) => d.clicks), maxClk, CLICK_COLOR);
    if (hasConversions) {
      drawLine(convValues, maxConv, CONV_COLOR);
    }

    // X-axis labels
    const step = Math.max(1, Math.floor(data.length / 6));
    ctx.fillStyle = "#888";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    data.forEach((d, i) => {
      if (i % step !== 0 && i !== data.length - 1) return;
      const x = padL + (i / Math.max(data.length - 1, 1)) * chartW;
      const label = new Date(d.day).toLocaleDateString("en", { month: "short", day: "numeric" });
      ctx.fillText(label, x, h - 8);
    });

    // Legend
    ctx.fillStyle = ACCENT;
    ctx.fillRect(padL, 4, 10, 3);
    ctx.fillStyle = "#aaa";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("impressions", padL + 14, 9);

    ctx.fillStyle = CLICK_COLOR;
    ctx.fillRect(padL + 100, 4, 10, 3);
    ctx.fillStyle = "#aaa";
    ctx.fillText("clicks", padL + 114, 9);

    if (hasConversions) {
      ctx.fillStyle = CONV_COLOR;
      ctx.fillRect(padL + 168, 4, 10, 3);
      ctx.fillStyle = "#aaa";
      ctx.fillText("conversions", padL + 182, 9);
    }
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center border-[3px] border-border">
        <p className="text-sm text-muted normal-case">No data for this period</p>
      </div>
    );
  }

  return (
    <div className="border-[3px] border-border p-3">
      <canvas
        ref={canvasRef}
        className="h-52 w-full"
        style={{ display: "block" }}
      />
    </div>
  );
}
