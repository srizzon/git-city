import * as vscode from "vscode";
import { initKeystore, getKey, getCachedKey, setKey, deleteKey } from "./auth/keystore";
import { initQueue, stopQueue } from "./api/queue";
import { initTracker, setPaused, isPaused, sendImmediateHeartbeat, sendOfflineSignal, buildOfflineHeartbeat } from "./activity/tracker";
import { sendDirect } from "./api/client";
import { initStatusBar, updateDisplay } from "./statusbar/item";
import { getConfig } from "./config";

export function activate(context: vscode.ExtensionContext) {
  initKeystore(context);
  initQueue(context);
  initStatusBar(context);

  // Start tracker with status bar callback
  initTracker(context, (status) => {
    if (status === "paused") {
      updateDisplay("paused");
    } else if (status === "idle") {
      updateDisplay("idle");
    } else {
      updateDisplay("active");
    }
  });

  // Check if we have a key and update status bar accordingly
  getKey().then((key) => {
    if (!key) {
      updateDisplay("connect");
    } else if (getConfig().enabled) {
      updateDisplay("active");
    }
  });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("gitCity.login", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "Paste your API key from thegitcity.com",
        placeHolder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        password: true,
        ignoreFocusOut: true,
      });

      if (key) {
        await setKey(key);
        updateDisplay("active");
        // Send a heartbeat immediately so the dev appears on the site within seconds
        sendImmediateHeartbeat();
        const action = await vscode.window.showInformationMessage(
          "Pulse connected. Your building is powering the city.",
          "See my building",
        );
        if (action === "See my building") {
          const { apiUrl } = getConfig();
          vscode.env.openExternal(vscode.Uri.parse(apiUrl));
        }
      }
    }),

    vscode.commands.registerCommand("gitCity.logout", async () => {
      await deleteKey();
      sendOfflineSignal();
      updateDisplay("connect");
      vscode.window.showInformationMessage("Pulse disconnected.");
    }),

    vscode.commands.registerCommand("gitCity.togglePause", () => {
      const newState = !isPaused();
      setPaused(newState);
      updateDisplay(newState ? "paused" : "active");
    }),

    vscode.commands.registerCommand("gitCity.showDashboard", () => {
      const { apiUrl } = getConfig();
      vscode.env.openExternal(vscode.Uri.parse(apiUrl));
    }),
  );
}

export async function deactivate() {
  // Use cached key since SecretStorage may be unavailable during shutdown.
  // VS Code waits for the returned Promise before killing the process.
  const key = getCachedKey();
  stopQueue();
  if (key) {
    await sendDirect(buildOfflineHeartbeat(), key);
  }
}
