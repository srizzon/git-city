import type { ReactNode } from "react";

// Every film page: the kit's studio in Git City's pixel font.

const CSS = `
.tk-studio { --tk-font: var(--font-pixel); }
`;

export default function TrailerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{CSS}</style>
      {children}
    </>
  );
}
