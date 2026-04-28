"use client";

import { type ReactNode } from "react";

const ACCENT = "#c8e64a";

export interface PaymentMethodOption<T extends string> {
  id: T;
  label: string;
  /** Optional secondary label, e.g. price hint or "-30%". */
  hint?: string;
  /** Hide the tab entirely when false. */
  visible?: boolean;
}

export interface PaymentMethodTabsProps<T extends string> {
  methods: PaymentMethodOption<T>[];
  selected: T;
  onChange: (id: T) => void;
  children: ReactNode;
}

export function PaymentMethodTabs<T extends string>({
  methods,
  selected,
  onChange,
  children,
}: PaymentMethodTabsProps<T>) {
  const visibleMethods = methods.filter((m) => m.visible !== false);

  if (visibleMethods.length === 0) return <>{children}</>;

  return (
    <div>
      <p className="mb-2 text-[10px] text-muted normal-case">Pay with</p>
      <div
        role="tablist"
        className="flex border-2 border-border"
      >
        {visibleMethods.map((m, idx) => {
          const active = m.id === selected;
          const isLast = idx === visibleMethods.length - 1;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(m.id)}
              className="flex-1 px-2 py-2 text-[10px] transition-colors normal-case cursor-pointer"
              style={{
                backgroundColor: active ? ACCENT : "transparent",
                color: active ? "#1a1018" : "var(--color-muted)",
                borderRight: isLast ? "none" : "2px solid var(--color-border)",
              }}
            >
              <span className="font-pixel">{m.label}</span>
              {m.hint && (
                <span className="ml-1 opacity-70">{m.hint}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
