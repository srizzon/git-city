import { getConfig } from "../config";

export interface RawHeartbeat {
  timestamp: string;
  language?: string;
  project?: string;
  branch?: string;
  isWrite: boolean;
  activeSeconds: number;
  sessionId: string;
  editorName: string;
  os: string;
  status?: "active" | "offline";
}

export function sanitize(hb: RawHeartbeat): RawHeartbeat {
  const cfg = getConfig();
  const sanitized = { ...hb };

  if (!cfg.shareLanguage) {
    delete sanitized.language;
  }

  if (!cfg.shareProject) {
    delete sanitized.project;
    delete sanitized.branch;
  }

  if (sanitized.project && cfg.excludeProjects.length > 0) {
    const lower = sanitized.project.toLowerCase();
    if (cfg.excludeProjects.some((p) => lower.includes(p.toLowerCase()))) {
      delete sanitized.project;
      delete sanitized.branch;
    }
  }

  return sanitized;
}
