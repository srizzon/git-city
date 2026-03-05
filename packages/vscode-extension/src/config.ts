import * as vscode from "vscode";
import { DEFAULT_API_URL } from "./constants";

export function getConfig() {
  const cfg = vscode.workspace.getConfiguration("gitCity");
  return {
    enabled: cfg.get<boolean>("enabled", true),
    apiUrl: cfg.get<string>("apiUrl", DEFAULT_API_URL),
    shareLanguage: cfg.get<boolean>("privacy.shareLanguage", true),
    shareProject: cfg.get<boolean>("privacy.shareProject", true),
    excludeProjects: cfg.get<string[]>("privacy.excludeProjects", []),
    idleTimeout: cfg.get<number>("idleTimeout", 300) * 1000,
  };
}
