"use client";

import { useEffect } from "react";
import { trackProfileViewed } from "@/lib/himetrica";

export default function ProfileTracker({ login }: { login: string }) {
  useEffect(() => {
    trackProfileViewed(login);
  }, [login]);
  return null;
}
