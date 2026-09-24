"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const EXIT_MS = 150;

/**
 * Enter/exit state for a sheet: `close()` plays the exit animation, then calls
 * `onClosed`. Returns the class to put on the sheet.
 */
export function useSheet(onClosed: () => void) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(onClosed);
  useEffect(() => {
    closedRef.current = onClosed;
  }, [onClosed]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const close = useCallback(() => {
    if (timer.current) return;
    setLeaving(true);
    timer.current = setTimeout(() => closedRef.current(), EXIT_MS);
  }, []);

  return { close, className: leaving ? "sheet-out" : "sheet-in" };
}
