"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Props {
  initialBalance?: number;
}

export default function PixelBalance({ initialBalance = 0 }: Props) {
  const [balance, setBalance] = useState(initialBalance);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/pixels/balance");
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance ?? 0);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 30_000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  return (
    <Link
      href="/pixels"
      className="flex items-center gap-1.5 border-2 border-border bg-bg/80 px-2.5 py-1 text-[10px] text-lime backdrop-blur-sm transition-colors hover:border-lime/50 hover:bg-lime/5 cursor-pointer"
    >
      <span className="font-bold">{balance.toLocaleString()}</span>
      <span className="text-lime/60">PX</span>
      <span className="text-lime/40 text-[8px]">+</span>
    </Link>
  );
}
