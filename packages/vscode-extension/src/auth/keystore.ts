import * as vscode from "vscode";

const SECRET_KEY = "gitCity.apiKey";

let secrets: vscode.SecretStorage;
let cachedKey: string | undefined;

export function initKeystore(context: vscode.ExtensionContext) {
  secrets = context.secrets;
  // Pre-cache key so deactivate can use it without async SecretStorage
  secrets.get(SECRET_KEY).then((k) => { cachedKey = k; });
}

export async function getKey(): Promise<string | undefined> {
  return secrets.get(SECRET_KEY);
}

/** Synchronous cached key for use during deactivate when SecretStorage may be unavailable. */
export function getCachedKey(): string | undefined {
  return cachedKey;
}

export async function setKey(key: string): Promise<void> {
  cachedKey = key;
  await secrets.store(SECRET_KEY, key);
}

export async function deleteKey(): Promise<void> {
  cachedKey = undefined;
  await secrets.delete(SECRET_KEY);
}
