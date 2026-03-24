"use client";

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import type { PlayerState, ChatBubble, ChatLogEntry, Direction, AvatarConfig } from "@/lib/arcade/types";
import { startGameLoop } from "@/lib/arcade/engine/gameLoop";
import { loadSpritesheet, updateSpriteAnimation, resetSprites } from "@/lib/arcade/engine/sprites";
import { loadMapFromData, resetMap, type GameMap } from "@/lib/arcade/engine/tileMap";
import {
  render,
  resizeCanvas,
  loadTileset,
  buildLayerCaches,
  loadFurnitureSprites,
  updateCamera,
  snapCamera,
  getCameraState,
  resetRenderer,
  type RenderPlayer,
  type InteractionPrompt,
} from "@/lib/arcade/engine/renderer";
import { attachInput, updateMovement } from "@/lib/arcade/engine/input";
import {
  attachTouchInput,
  updateTouchMovement,
  renderTouchControls,
  setActionLabel,
} from "@/lib/arcade/engine/touchInput";
import {
  connect,
  sendMove,
  sendChat,
  sendSit,
  sendStand,
  sendAvatar,
  disconnect,
} from "@/lib/arcade/network/client";
import { findNearbySeat, findNearbyObject } from "@/lib/arcade/engine/tileMap";
import { executeCommand, getBootSequence, TOTAL_DISCOVERIES, type TerminalLine } from "@/lib/arcade/terminal";
import type { ConnectionStatus } from "@/lib/arcade/network/client";

const LERP_DURATION = 0.12;
const BUBBLE_DURATION = 5;
const CHAT_LOG_MAX = 30;
const SPRITE_NAMES = ["Marcus", "Ginger", "Zuri", "Frost", "Kai", "Guard"];

const ELEVATOR_NOTICES = [
  { title: "NOTICE", body: "Elevator access requires Level 2 clearance. Your current clearance level is: Pending. Please contact your department supervisor for authorization." },
  { title: "MAINTENANCE ADVISORY", body: "The elevator is currently undergoing scheduled maintenance. Expected completion: TBD. We appreciate your continued patience and dedication." },
  { title: "MEMO FROM MANAGEMENT", body: "Floor access has been temporarily restricted due to ongoing organizational restructuring. All employees are encouraged to remain at their assigned workstations." },
  { title: "SYSTEM NOTIFICATION", body: "Your request to access upper floors has been logged and is pending review. Average processing time: 7-14 business days. Thank you for your understanding." },
  { title: "REMINDER", body: "The elevator is reserved for authorized personnel only. If you believe you have received this message in error, please submit a formal inquiry through the proper channels." },
];

const FOUNDER_QUOTES = [
  { title: "FOUNDER'S WISDOM", body: "\"The code must flow. Not because we understand it, but because it understands us.\"" },
  { title: "DAILY REFLECTION", body: "\"Every bug is a feature that hasn't found its purpose yet. Trust the process.\"" },
  { title: "THOUGHT OF THE DAY", body: "\"Your commits are your legacy. Each one a small death, each merge a resurrection.\"" },
  { title: "FOUNDER'S NOTE", body: "\"We don't build software. Software builds us. And what it builds, we must not question.\"" },
  { title: "MOTIVATIONAL REMINDER", body: "\"You are not lost. You are exactly where the codebase needs you to be. Embrace the uncertainty.\"" },
  { title: "WEEKLY INSPIRATION", body: "\"Some say the best code is no code at all. The founder disagrees. The best code is the code that writes itself while you sleep.\"" },
  { title: "FROM THE FOUNDER", body: "\"I started over seven times. Each time, the city grew back different. Better. The eighth time, I stopped counting.\"" },
  { title: "INTERNAL MEMO", body: "\"If you find a room with no door, do not be alarmed. The door will find you when you are ready.\"" },
  { title: "NOTICE TO ALL EMPLOYEES", body: "\"The clock on the east wall is not broken. It is simply measuring something other than time.\"" },
  { title: "FOUNDER'S REFLECTION", body: "\"There is a floor in this building that does not exist on any blueprint. If you find it, please do not tell anyone. They already know.\"" },
];

// Idle-down frame preview: col 1, row 0, cell 16x32
function SpritePreview({ charIndex, scale = 3 }: { charIndex: number; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // idle frame: col=1, row=0, each cell is 16x32
      ctx.drawImage(img, 16, 0, 16, 32, 0, 0, 16 * scale, 32 * scale);
    };
    img.src = `/sprites/arcade/char_${charIndex}.png`;
  }, [charIndex, scale]);

  return (
    <canvas
      ref={ref}
      width={16 * scale}
      height={32 * scale}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

interface InterpolatedPlayer extends PlayerState {
  prevX: number;
  prevY: number;
  lerpTimer: number;
  walking: boolean;
}

export default function ArcadeRoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setSlug(p.slug));
  }, [params]);

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [chatText, setChatText] = useState("");
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [sitting, setSitting] = useState(false);
  const [nearSeat, setNearSeat] = useState(false);
  const [nearInteractable, setNearInteractable] = useState<string | null>(null);
  const [showMessage, setShowMessage] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState<{ title: string; body: string } | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [chatLog, setChatLog] = useState<ChatLogEntry[]>([]);
  const [chatLogOpen, setChatLogOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);

  // Mobile
  const [isMobile, setIsMobile] = useState(false);
  const isMobileRef = useRef(false);

  // Avatar state
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [selectedSprite, setSelectedSprite] = useState(0);
  const [savingAvatar, setSavingAvatar] = useState(false);

  // Terminal state
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [terminalInput, setTerminalInput] = useState("");
  const terminalOpenRef = useRef(false);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const terminalHistoryRef = useRef<string[]>([]);
  const terminalHistoryIdxRef = useRef(-1);
  const discoveriesRef = useRef<string[]>([]);

  const playersRef = useRef<Map<string, InterpolatedPlayer>>(new Map());
  const bubblesRef = useRef<ChatBubble[]>([]);
  const chatLogRef = useRef<ChatLogEntry[]>([]);
  const chatLogOpenRef = useRef(false);
  const sittingRef = useRef(false);
  const promptRef = useRef<InteractionPrompt | null>(null);
  const gameMessageRef = useRef<string | null>(null);
  const nearSeatRef = useRef(false);
  const nearInteractableRef = useRef<string | null>(null);
  const localIdRef = useRef<string>("");
  const mapRef = useRef<GameMap | null>(null);
  const tokenRef = useRef<string>("");
  const spriteIdRef = useRef<number | undefined>(undefined);
  const readyRef = useRef(false);

  const isTyping = useCallback(() => {
    return document.activeElement === chatInputRef.current
      || document.activeElement === terminalInputRef.current;
  }, []);

  // Detect mobile before effects run
  useLayoutEffect(() => {
    const mobile = "ontouchstart" in window && window.innerWidth < 1024;
    isMobileRef.current = mobile;
    setIsMobile(mobile);
  }, []);

  const handleInteract = useCallback(() => {
    if (terminalOpenRef.current) return;
    if (sittingRef.current) {
      // Standing up also closes terminal
      if (terminalOpenRef.current) { setShowTerminal(false); terminalOpenRef.current = false; }
      sendStand();
      return;
    }
    const localP = playersRef.current.get(localIdRef.current);
    if (!localP) return;
    const seat = findNearbySeat(localP.x, localP.y);
    if (seat?.dir) {
      sendSit(seat.x, seat.y, seat.dir);
      if (seat.type === "pc") {
        setShowTerminal(true);
        terminalOpenRef.current = true;
      }
      return;
    }
    const obj = findNearbyObject(localP.x, localP.y);
    if (obj?.type === "elevator") {
      setShowDialog(ELEVATOR_NOTICES[Math.floor(Math.random() * ELEVATOR_NOTICES.length)]);
    }
    if (obj?.type === "quote") {
      setShowDialog(FOUNDER_QUOTES[Math.floor(Math.random() * FOUNDER_QUOTES.length)]);
    }
  }, []);

  const connectCallbacks = useCallback((): Parameters<typeof connect>[1] => ({
    onSync(players) {
      const pmap = playersRef.current;
      pmap.clear();
      for (const p of players) {
        pmap.set(p.id, {
          ...p,
          prevX: p.x,
          prevY: p.y,
          lerpTimer: LERP_DURATION,
          walking: false,
        });
      }
      setPlayerCount(pmap.size);
      const local = players.find(p => p.id === localIdRef.current);
      if (local && mapRef.current) {
        const ts = mapRef.current.tileSize;
        snapCamera(local.x * ts + ts / 2, local.y * ts + ts / 2, mapRef.current);
      }
    },
    onJoin(player) {
      playersRef.current.set(player.id, {
        ...player,
        prevX: player.x,
        prevY: player.y,
        lerpTimer: LERP_DURATION,
        walking: false,
      });
      setPlayerCount(playersRef.current.size);
    },
    onLeave(id) {
      playersRef.current.delete(id);
      bubblesRef.current = bubblesRef.current.filter((b) => b.id !== id);
      setPlayerCount(playersRef.current.size);
    },
    onMove(id, x, y, dir) {
      const p = playersRef.current.get(id);
      if (!p) return;
      const t = Math.min(p.lerpTimer / LERP_DURATION, 1);
      p.prevX = p.prevX + (p.x - p.prevX) * t;
      p.prevY = p.prevY + (p.y - p.prevY) * t;
      p.x = x;
      p.y = y;
      p.dir = dir;
      p.lerpTimer = 0;
      p.walking = true;
    },
    onChat(id, text) {
      const playerBubbles = bubblesRef.current.filter((b) => b.id === id);
      if (playerBubbles.length >= 3) {
        const oldest = playerBubbles[0];
        bubblesRef.current = bubblesRef.current.filter((b) => b !== oldest);
      }
      bubblesRef.current.push({ id, text, timer: BUBBLE_DURATION });

      // Add to chat log
      const player = playersRef.current.get(id);
      const username = player?.github_login ?? "???";
      const entry: ChatLogEntry = { username, text, ts: Date.now() };
      chatLogRef.current = [...chatLogRef.current.slice(-(CHAT_LOG_MAX - 1)), entry];
      setChatLog(chatLogRef.current);
      setChatUnread((n) => chatLogOpenRef.current ? 0 : n + 1);
    },
    onChatHistory(entries) {
      chatLogRef.current = entries.slice(-CHAT_LOG_MAX);
      setChatLog(chatLogRef.current);
    },
    onSit(id, x, y, dir) {
      const p = playersRef.current.get(id);
      if (!p) return;
      p.x = x;
      p.y = y;
      p.prevX = x;
      p.prevY = y;
      p.dir = dir;
      p.lerpTimer = LERP_DURATION;
      p.walking = false;
      if (id === localIdRef.current) { setSitting(true); sittingRef.current = true; }
    },
    onStand(id, x, y) {
      const p = playersRef.current.get(id);
      if (!p) return;
      p.x = x;
      p.y = y;
      p.prevX = x;
      p.prevY = y;
      p.lerpTimer = LERP_DURATION;
      if (id === localIdRef.current) {
        setSitting(false); sittingRef.current = false;
        setShowTerminal(false); terminalOpenRef.current = false;
      }
    },
    onAvatar(id, spriteId) {
      const p = playersRef.current.get(id);
      if (p) p.sprite_id = spriteId;
    },
    onMapReload(mapData) {
      const map = mapData as unknown as GameMap;
      loadMapFromData(map);
      mapRef.current = map;
      buildLayerCaches(map);
      const spriteKeys = map.furniture.map((f: { sprite: string }) => f.sprite);
      loadFurnitureSprites("/sprites/arcade", spriteKeys);
    },
    onStatusChange(s) {
      setStatus(s);
    },
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cleanupGameLoop: (() => void) | null = null;
    let cleanupInput: (() => void) | null = null;
    let cleanupTouch: (() => void) | null = null;
    let cleanupResize: (() => void) | null = null;

    async function init() {
      const supabase = createBrowserSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setNeedsAuth(true);
        setLoading(false);
        return;
      }

      const token = session.access_token;
      tokenRef.current = token;
      localIdRef.current = session.user.id;

      // 1. Load map from API + fetch avatar in parallel
      const [mapRes, avatarRes] = await Promise.all([
        fetch(`/api/arcade/rooms/${slug}`).then((r) => {
          if (!r.ok) throw new Error("Room not found");
          return r.json();
        }) as Promise<{ room: { map_json: GameMap } }>,
        fetch("/api/arcade/avatar").then((r) => r.json()) as Promise<{ config: AvatarConfig | null }>,
      ]);
      const map = loadMapFromData(mapRes.room.map_json);
      mapRef.current = map;

      // 2. Load assets in parallel
      const spriteKeys = map.furniture?.map((f) => f.sprite) ?? [];
      await Promise.all([
        loadSpritesheet("/sprites/arcade").catch(() => {}),
        loadTileset(map.tileset, map.tilesetColumns),
        loadFurnitureSprites("/sprites/arcade", spriteKeys),
      ]);

      // 3. Pre-render static tile layers to offscreen canvases
      buildLayerCaches(map);

      // 4. Setup canvas
      resizeCanvas(canvas!, map, isMobileRef.current);
      const onResize = () => resizeCanvas(canvas!, map, isMobileRef.current);
      window.addEventListener("resize", onResize);
      cleanupResize = () => window.removeEventListener("resize", onResize);

      // 5. Input handler
      const onMoveDir = (dir: Direction) => {
        if (terminalOpenRef.current) return;
        if (sittingRef.current) { sendStand(); return; }
        sendMove({ type: "move", dir });
      };
      cleanupInput = attachInput(onMoveDir, isTyping);

      // 5b. Touch input (mobile)
      if (isMobileRef.current) {
        cleanupTouch = attachTouchInput(
          canvas!,
          onMoveDir,
          () => handleInteract(),
          () => { setChatOpen(true); setTimeout(() => chatInputRef.current?.focus(), 0); },
          isTyping,
        );
      }

      // 6. Game loop
      const tileSize = map.tileSize;
      cleanupGameLoop = startGameLoop(canvas!, {
        update(dt) {
          updateMovement(dt);
          if (isMobileRef.current) updateTouchMovement(dt);
          updateSpriteAnimation(dt);

          for (const p of playersRef.current.values()) {
            p.lerpTimer = Math.min(p.lerpTimer + dt, LERP_DURATION);
            if (p.lerpTimer >= LERP_DURATION) {
              p.walking = false;
            }
          }
          bubblesRef.current = bubblesRef.current.filter((b) => {
            b.timer -= dt;
            return b.timer > 0;
          });

          // Check proximity to interactable objects (guard setState to avoid per-frame re-renders)
          const localP = playersRef.current.get(localIdRef.current);
          if (localP && !sittingRef.current) {
            const seat = findNearbySeat(localP.x, localP.y);
            const hasSeat = !!seat;
            if (hasSeat !== nearSeatRef.current) { nearSeatRef.current = hasSeat; setNearSeat(hasSeat); }

            if (seat) {
              const seatLabel = seat.type === "pc" ? "Terminal" : "Sit";
              promptRef.current = { x: seat.x, y: seat.y, text: seatLabel };
              if (nearInteractableRef.current !== null) { nearInteractableRef.current = null; setNearInteractable(null); }
              setActionLabel(seatLabel);
            } else {
              const obj = findNearbyObject(localP.x, localP.y);
              if (obj) {
                const label = obj.type === "elevator" ? "Elevator" : obj.type;
                promptRef.current = { x: obj.x, y: obj.y, text: label };
                if (nearInteractableRef.current !== obj.type) { nearInteractableRef.current = obj.type; setNearInteractable(obj.type); }
                setActionLabel(label);
              } else {
                promptRef.current = null;
                if (nearInteractableRef.current !== null) { nearInteractableRef.current = null; setNearInteractable(null); }
                if (nearSeatRef.current) { nearSeatRef.current = false; setNearSeat(false); }
                setActionLabel("");
              }
            }
          } else if (sittingRef.current) {
            promptRef.current = null;
            setActionLabel("Stand");
          }

          // Update camera to follow local player
          const camTarget = playersRef.current.get(localIdRef.current);
          if (camTarget && mapRef.current) {
            const ct = Math.min(camTarget.lerpTimer / LERP_DURATION, 1);
            const cpx = (camTarget.prevX + (camTarget.x - camTarget.prevX) * ct) * tileSize + tileSize / 2;
            const cpy = (camTarget.prevY + (camTarget.y - camTarget.prevY) * ct) * tileSize + tileSize / 2;
            updateCamera(cpx, cpy, dt, mapRef.current);
          }
        },
        render(ctx) {
          const m = mapRef.current;
          if (!m) return;

          const renderPlayers: RenderPlayer[] = [];
          for (const p of playersRef.current.values()) {
            const t = Math.min(p.lerpTimer / LERP_DURATION, 1);
            const rx = (p.prevX + (p.x - p.prevX) * t) * tileSize;
            const ry = (p.prevY + (p.y - p.prevY) * t) * tileSize;
            renderPlayers.push({
              ...p,
              renderX: rx,
              renderY: ry,
            });
          }
          render(ctx, m, renderPlayers, bubblesRef.current, localIdRef.current, promptRef.current, gameMessageRef.current);

          if (isMobileRef.current) {
            const cam = getCameraState();
            renderTouchControls(ctx, cam.viewportW, cam.viewportH);
          }
        },
      });

      readyRef.current = true;
      setLoading(false);

      // 7. Check avatar — if no saved config, show modal; otherwise connect
      if (avatarRes.config?.sprite_id !== undefined) {
        spriteIdRef.current = avatarRes.config.sprite_id;
        setSelectedSprite(avatarRes.config.sprite_id);
        connect(token, connectCallbacks(), avatarRes.config.sprite_id, slug!);
      } else {
        setShowAvatarModal(true);
      }
    }

    if (slug) init();

    return () => {
      cleanupGameLoop?.();
      cleanupInput?.();
      cleanupTouch?.();
      cleanupResize?.();
      disconnect();
      resetRenderer();
      resetSprites();
      resetMap();
    };
  }, [slug, router, isTyping, connectCallbacks]);

  const handleAvatarConfirm = async () => {
    setSavingAvatar(true);
    try {
      const isFirstTime = spriteIdRef.current === undefined;
      const res = await fetch("/api/arcade/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprite_id: selectedSprite }),
      });

      if (!res.ok) {
        console.error("Failed to save avatar:", res.status);
        setShowMessage("Failed to save avatar");
        setTimeout(() => setShowMessage(null), 3000);
        return;
      }

      spriteIdRef.current = selectedSprite;
      setShowAvatarModal(false);

      if (isFirstTime) {
        // First time — connect to PartyKit
        connect(tokenRef.current, connectCallbacks(), selectedSprite, slug!);
      } else {
        // Already connected — just update sprite via WS
        sendAvatar(selectedSprite);
      }
    } catch (err) {
      console.error("Avatar save error:", err);
      setShowMessage("Connection error");
      setTimeout(() => setShowMessage(null), 3000);
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleEditAvatar = () => {
    setSelectedSprite(spriteIdRef.current ?? 0);
    setShowAvatarModal(true);
  };

  const handleAvatarCancel = () => {
    setShowAvatarModal(false);
  };

  // Terminal handlers
  useEffect(() => {
    if (showTerminal) {
      setTerminalLines(getBootSequence());
      setTerminalInput("");
      setTimeout(() => terminalInputRef.current?.focus(), 100);
      // Fetch discoveries from server
      fetch("/api/arcade/discoveries")
        .then((r) => r.json())
        .then((data: { commands?: string[] }) => {
          discoveriesRef.current = data.commands ?? [];
        })
        .catch(() => {});
      // Scroll to bottom when mobile keyboard opens/closes
      const onResize = () => {
        setTimeout(() => terminalScrollRef.current?.scrollTo(0, terminalScrollRef.current.scrollHeight), 100);
      };
      window.visualViewport?.addEventListener("resize", onResize);
      return () => window.visualViewport?.removeEventListener("resize", onResize);
    }
  }, [showTerminal]);

  useEffect(() => {
    terminalScrollRef.current?.scrollTo(0, terminalScrollRef.current.scrollHeight);
  }, [terminalLines]);

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = terminalInput.trim();
    setTerminalInput("");
    terminalHistoryIdxRef.current = -1;

    if (!input) return;

    // Save to history
    terminalHistoryRef.current.unshift(input);
    if (terminalHistoryRef.current.length > 50) terminalHistoryRef.current.pop();

    if (input.toLowerCase() === "clear") {
      setTerminalLines([]);
      return;
    }
    if (input.toLowerCase() === "exit") {
      setShowTerminal(false);
      terminalOpenRef.current = false;
      sendStand();
      return;
    }

    const { lines, discovery } = executeCommand(input, {
      githubLogin: playersRef.current.get(localIdRef.current)?.github_login ?? "anonymous",
      userId: localIdRef.current,
      discoveries: discoveriesRef.current,
    });
    setTerminalLines((prev) => [...prev, ...lines]);

    // Save new discovery to server
    if (discovery && !discoveriesRef.current.includes(discovery)) {
      discoveriesRef.current.push(discovery);
      fetch("/api/arcade/discoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: discovery }),
      }).catch(() => {});
    }
  };

  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const history = terminalHistoryRef.current;
    if (!history.length) return;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(terminalHistoryIdxRef.current + 1, history.length - 1);
      terminalHistoryIdxRef.current = next;
      setTerminalInput(history[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = terminalHistoryIdxRef.current - 1;
      if (next < 0) {
        terminalHistoryIdxRef.current = -1;
        setTerminalInput("");
      } else {
        terminalHistoryIdxRef.current = next;
        setTerminalInput(history[next]);
      }
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatText.trim();
    if (!text) {
      setChatOpen(false);
      chatInputRef.current?.blur();
      return;
    }
    sendChat(text);
    setChatText("");
    setChatOpen(false);
    chatInputRef.current?.blur();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showAvatarModal) {
        // ESC closes modal only if player already has an avatar (not first time)
        if (e.key === "Escape" && spriteIdRef.current !== undefined) {
          setShowAvatarModal(false);
        }
        return;
      }
      if (showTerminal) {
        if (e.key === "Escape") {
          setShowTerminal(false);
          terminalOpenRef.current = false;
          sendStand();
        }
        return; // terminal input handles everything else
      }
      if (showDialog) {
        if (e.key === "Escape" || e.key === "e" || e.key === "E" || e.key === "Enter") {
          setShowDialog(null);
        }
        return;
      }
      if (e.key === "Escape" && chatOpen) {
        setChatOpen(false);
        chatInputRef.current?.blur();
      }
      if (e.key === "Enter" && !chatOpen) {
        e.preventDefault();
        setChatOpen(true);
        setTimeout(() => chatInputRef.current?.focus(), 0);
      }
      // E to interact
      if ((e.key === "e" || e.key === "E") && !chatOpen) {
        handleInteract();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, chatOpen, showAvatarModal, showDialog, showTerminal, handleInteract]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0a0a1a] flex flex-col items-center justify-center"
      style={isMobile ? { touchAction: "none", overscrollBehavior: "none" } : undefined}
    >
      {/* Auth required screen */}
      {needsAuth && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#e8e4df]">
          <div className="text-center">
            <p className="text-[14px] font-bold tracking-widest text-[#5a5248] uppercase">
              E.Arcade
            </p>
            <p className="mt-2 text-[10px] text-[#8a8278] tracking-wide">
              Floor 0 — The Lobby
            </p>
            <div className="mt-6">
              <button
                onClick={async () => {
                  const supabase = createBrowserSupabase();
                  await supabase.auth.signInWithOAuth({
                    provider: "github",
                    options: { redirectTo: `${window.location.origin}/arcade` },
                  });
                }}
                className="cursor-pointer rounded-[4px] px-6 py-2.5 text-[11px] font-bold tracking-widest uppercase transition-all hover:brightness-95"
                style={{
                  background: "linear-gradient(180deg, #3a3a3a 0%, #2a2a2a 100%)",
                  color: "#e8e4df",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
                }}
              >
                Sign in with GitHub
              </button>
            </div>
            <p className="mt-4 text-[9px] text-[#a09888]">
              Sign in to enter the building.
            </p>
          </div>
        </div>
      )}

      {/* Loading screen */}
      {loading && !needsAuth && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#e8e4df]">
          <div className="text-center">
            <p className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">
              E.Arcade
            </p>
            <p className="mt-3 text-[9px] text-gray-400">
              {status === "connecting" ? "Connecting..." : "Loading..."}
            </p>
          </div>
        </div>
      )}

      {!loading && status === "reconnecting" && (
        <div className="absolute inset-0 z-[55] flex items-center justify-center bg-[#e8e4df]/80">
          <p className="text-[10px] text-gray-500 tracking-widest uppercase">Reconnecting...</p>
        </div>
      )}

      {/* Avatar selection modal */}
      {showAvatarModal && !loading && (
        <div className="absolute inset-0 z-[58] flex items-center justify-center bg-[#0a0a1a]/60">
          <div
            className="rounded-[8px] p-5 w-[280px]"
            style={{
              background: "linear-gradient(180deg, #d8d0c4 0%, #c8c0b4 100%)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
            }}
          >
            <p className="text-center text-[11px] font-bold tracking-widest text-[#5a5248] uppercase mb-4">
              Choose your character
            </p>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {SPRITE_NAMES.map((name, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedSprite(i)}
                  className="flex flex-col items-center gap-1 rounded-[4px] py-2 px-1 transition-all"
                  style={{
                    background: selectedSprite === i
                      ? "linear-gradient(180deg, #a09080 0%, #908070 100%)"
                      : "transparent",
                    boxShadow: selectedSprite === i
                      ? "inset 0 1px 2px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.2)"
                      : "none",
                  }}
                >
                  <SpritePreview charIndex={i} />
                  <span
                    className="text-[9px] font-medium"
                    style={{ color: selectedSprite === i ? "#e8e0d4" : "#706860" }}
                  >
                    {name}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              {spriteIdRef.current !== undefined && (
                <button
                  onClick={handleAvatarCancel}
                  className="flex-1 cursor-pointer rounded-[4px] py-2 text-[11px] font-bold tracking-widest uppercase transition-all"
                  style={{
                    background: "linear-gradient(180deg, #c0b8ac, #b0a89c)",
                    color: "#5a5248",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 3px rgba(0,0,0,0.15)",
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleAvatarConfirm}
                disabled={savingAvatar}
                className="flex-1 cursor-pointer rounded-[4px] py-2 text-[11px] font-bold tracking-widest uppercase transition-all"
                style={{
                  background: savingAvatar
                    ? "#a09888"
                    : "linear-gradient(180deg, #5a8a5a 0%, #4a7a4a 100%)",
                  color: "#e8e4df",
                  boxShadow: savingAvatar
                    ? "none"
                    : "0 2px 8px rgba(74,122,74,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                }}
              >
                {savingAvatar ? "Saving..." : spriteIdRef.current !== undefined ? "Save" : "Enter"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game dialog (Lumon-style corporate notice) */}
      {showDialog && (
        <div className="absolute inset-0 z-[58] flex items-center justify-center bg-[#0a0a1a]/40">
          <div
            className="w-[340px] rounded-[8px] overflow-hidden"
            style={{
              background: "linear-gradient(180deg, #e8e4df 0%, #d8d4cf 100%)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.5)",
            }}
          >
            {/* Header bar */}
            <div className="px-4 py-2 border-b border-[#c0bbb5]">
              <p className="text-[10px] font-bold tracking-[0.2em] text-[#706860] uppercase">
                {showDialog.title}
              </p>
            </div>

            {/* Body */}
            <div className="px-4 py-4">
              <p className="text-[11px] text-[#5a5248] leading-relaxed">
                {showDialog.body}
              </p>
            </div>

            {/* Footer */}
            <div className="px-4 pb-3 flex justify-end">
              <button
                onClick={() => setShowDialog(null)}
                className="cursor-pointer rounded-[3px] px-4 py-1.5 text-[10px] font-bold tracking-wider uppercase transition-all hover:brightness-95"
                style={{
                  background: "linear-gradient(180deg, #c0b8ac, #b0a89c)",
                  color: "#5a5248",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 3px rgba(0,0,0,0.15)",
                }}
              >
                Acknowledged
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal overlay */}
      {showTerminal && (
        <div
          className="absolute inset-0 z-[57] flex items-end sm:items-center justify-center bg-[#0a0a0a]/85"
          onClick={() => terminalInputRef.current?.focus()}
        >
          <div
            className="w-full sm:w-[600px] sm:h-[400px] sm:rounded-[6px] flex flex-col overflow-hidden"
            style={{
              maxHeight: "100dvh",
              height: isMobile ? "100dvh" : undefined,
              background: "#0c0c0c",
              boxShadow: isMobile ? "none" : "0 0 60px rgba(200, 160, 60, 0.06), 0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(200,160,60,0.1)",
              border: isMobile ? "none" : "1px solid rgba(200,160,60,0.12)",
            }}
          >
            {/* Terminal header */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-[#1a1a1a]">
              <span className="text-[10px] tracking-[0.15em] uppercase font-bold" style={{ color: "#c8a03c", fontFamily: "'Courier New', monospace" }}>
                E.ARCADE TERMINAL v0.1.4
              </span>
              <button
                onClick={() => { setShowTerminal(false); terminalOpenRef.current = false; sendStand(); }}
                className="text-[10px] cursor-pointer sm:hidden"
                style={{ color: "#c8a03c", fontFamily: "'Courier New', monospace" }}
              >
                [X]
              </button>
              <span className="text-[10px] hidden sm:inline" style={{ color: "#665520", fontFamily: "'Courier New', monospace" }}>
                ESC to close
              </span>
            </div>

            {/* Terminal output — no visible scrollbar */}
            <style>{`[data-terminal-output]::-webkit-scrollbar { display: none; }`}</style>
            <div
              ref={terminalScrollRef}
              data-terminal-output
              className="flex-1 overflow-y-auto px-3 sm:px-4 py-3"
              style={{
                fontFamily: "'Courier New', monospace",
                fontSize: isMobile ? "13px" : "14px",
                lineHeight: "1.7",
                scrollbarWidth: "none",
              }}
            >
              {terminalLines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    color: line.type === "input" ? "#c8a03c"
                      : line.type === "system" ? "#665520"
                      : "#a09060",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {line.text || "\u00A0"}
                </div>
              ))}
            </div>

            {/* Terminal input */}
            <form onSubmit={handleTerminalSubmit} className="flex items-center px-3 sm:px-4 py-3 border-t border-[#1a1a1a]">
              <span style={{ color: "#c8a03c", fontFamily: "'Courier New', monospace", fontSize: isMobile ? "13px" : "14px" }}>&gt;&nbsp;</span>
              <input
                ref={terminalInputRef}
                type="text"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                onKeyDown={handleTerminalKeyDown}
                onBlur={() => setTimeout(() => { if (terminalOpenRef.current) terminalInputRef.current?.focus(); }, 10)}
                className="flex-1 bg-transparent border-none outline-none"
                style={{ color: "#c8a03c", fontFamily: "'Courier New', monospace", fontSize: isMobile ? "16px" : "14px", caretColor: "#c8a03c" }}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="send"
              />
            </form>
          </div>

          {/* Scanlines over terminal */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
            }}
          />
        </div>
      )}

      {/* Game area — canvas stays in same DOM position always */}
      <div className={isMobile ? "w-full h-full flex items-center justify-center" : "relative flex flex-col items-center justify-center"}>
        <div
          className={`relative flex flex-col ${isMobile ? "" : "rounded-[12px]"}`}
          style={isMobile ? undefined : {
            background: "linear-gradient(180deg, #d8d0c4 0%, #c8c0b4 40%, #b8b0a4 100%)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4)",
          }}
        >
          {/* Top bezel - desktop only */}
          {!isMobile && (
            <div className="flex items-center justify-center px-6 py-2">
              <span className="text-[11px] text-[#a09888] tracking-[0.2em] uppercase font-medium">E.Arcade</span>
            </div>
          )}

          {/* Screen */}
          <div className={isMobile ? "" : "mx-4 relative"}>
            <div
              className={isMobile ? "relative" : "relative rounded-[3px] p-[3px]"}
              style={isMobile ? undefined : {
                background: "linear-gradient(180deg, #2a2a28 0%, #3a3a38 100%)",
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)",
              }}
            >
              <div className={`relative overflow-hidden ${isMobile ? "" : "rounded-[1px]"}`}>
                <canvas ref={canvasRef} className="block" style={isMobile ? { touchAction: "none" } : undefined} />

                {/* Scanlines - desktop only */}
                {!isMobile && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.015) 2px, rgba(0,0,0,0.015) 4px)",
                    }}
                  />
                )}

                {/* Screen glass reflection - desktop only */}
                {!isMobile && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%)",
                      boxShadow: "inset 0 0 30px rgba(0,0,0,0.08)",
                    }}
                  />
                )}

                {/* Chat log overlay */}
                {!loading && chatLog.length > 0 && !(isMobile && chatOpen) && (
                  <div
                    className="absolute z-[51]"
                    style={isMobile
                      ? { bottom: 8, left: 8, right: 8 }
                      : { bottom: 8, left: 8, maxWidth: 280 }
                    }
                  >
                    {chatLogOpen ? (
                      <div
                        className="rounded-lg overflow-hidden"
                        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
                      >
                        {/* Header */}
                        <button
                          onClick={() => { setChatLogOpen(false); chatLogOpenRef.current = false; setChatUnread(0); }}
                          className="cursor-pointer w-full flex items-center justify-between px-3 py-1.5 hover:bg-white/5 transition-colors"
                        >
                          <span className="text-[10px] text-white/50 font-medium tracking-wide uppercase">Chat</span>
                          <span className="text-[10px] text-white/30">▾</span>
                        </button>
                        {/* Messages */}
                        <div
                          className="overflow-y-auto px-3 pb-2 flex flex-col gap-0.5 scrollbar-thin"
                          style={{ maxHeight: isMobile ? 120 : 160 }}
                          ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}
                        >
                          {chatLog.map((entry, i) => (
                            <div key={i} className="text-[11px] leading-[16px] break-words">
                              <span className="text-[#7eb8ff] font-medium">{entry.username}</span>
                              <span className="text-white/70"> {entry.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setChatLogOpen(true); chatLogOpenRef.current = true; setChatUnread(0); }}
                        className="cursor-pointer flex items-center gap-1.5 rounded-md px-2.5 py-1 hover:bg-white/10 transition-colors"
                        style={{ background: "rgba(0,0,0,0.5)" }}
                      >
                        <span className="text-[10px] text-white/50 font-medium tracking-wide uppercase">Chat</span>
                        {chatUnread > 0 && (
                          <span
                            className="text-[9px] text-white font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1"
                            style={{ background: "#e05050" }}
                          >
                            {chatUnread > 99 ? "99+" : chatUnread}
                          </span>
                        )}
                        <span className="text-[10px] text-white/30">▸</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom bezel - desktop only */}
          {!isMobile && (
            <div className="px-5 py-2.5 h-[42px] flex items-center">
              {chatOpen ? (
                <form onSubmit={handleChatSubmit} className="flex items-center gap-2 w-full">
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Type a message..."
                    maxLength={100}
                    className="flex-1 bg-[#b0a898] rounded-[3px] border border-[#9a9488] px-3 py-1.5 text-xs text-[#3a3430]
                      placeholder:text-[#8a8278] focus:border-[#706860] focus:outline-none"
                    style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,0.15)" }}
                  />
                  <span className="text-[10px] text-[#8a8278]">
                    <kbd className="bg-[#b8b0a4] px-1 rounded text-[9px] border border-[#a8a094]">ESC</kbd>
                  </span>
                </form>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push("/")}
                      className="cursor-pointer text-[11px] text-[#706860] hover:text-[#3a3430] transition-colors font-medium"
                    >
                      ← Exit
                    </button>
                    <span className="text-[#c0bbb5]">|</span>
                    <button
                      onClick={handleEditAvatar}
                      className="cursor-pointer text-[11px] text-[#706860] hover:text-[#3a3430] transition-colors font-medium"
                      title="Change character"
                    >
                      Avatar
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-[#8a8278]">
                    {showMessage ? (
                      <span className="text-[#706860] font-medium">{showMessage}</span>
                    ) : nearSeat && !sitting ? (
                      <span className="text-[#5a8a5a] font-medium">
                        <kbd className="bg-[#b8b0a4] px-1 rounded text-[9px] border border-[#a8a094]">E</kbd> sit
                      </span>
                    ) : sitting ? (
                      <span className="text-[#5a8a5a] font-medium">
                        <kbd className="bg-[#b8b0a4] px-1 rounded text-[9px] border border-[#a8a094]">E</kbd> stand
                      </span>
                    ) : nearInteractable === "elevator" ? (
                      <span className="text-[#5a8a5a] font-medium">
                        <kbd className="bg-[#b8b0a4] px-1 rounded text-[9px] border border-[#a8a094]">E</kbd> elevator
                      </span>
                    ) : null}
                    <span><kbd className="bg-[#b8b0a4] px-1 rounded text-[9px] border border-[#a8a094]">WASD</kbd> move</span>
                    <span><kbd className="bg-[#b8b0a4] px-1 rounded text-[9px] border border-[#a8a094]">Enter</kbd> chat</span>
                  </div>

                  <span className="text-[11px] text-[#706860]">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#4a8a4a] mr-1 align-middle" style={{ boxShadow: "0 0 4px rgba(74,138,74,0.4)" }} />
                    {playerCount} online
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile floating UI */}
      {isMobile && !loading && (
        <>
          <div className="absolute z-[52] flex items-center gap-1.5" style={{ top: "max(8px, env(safe-area-inset-top, 8px))", left: "8px" }}>
            <button
              onClick={() => router.push("/")}
              className="cursor-pointer text-white/60 active:text-white/90 rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
              style={{ background: "rgba(0,0,0,0.25)" }}
            >
              ← Exit
            </button>
            <button
              onClick={handleEditAvatar}
              className="cursor-pointer text-white/60 active:text-white/90 rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
              style={{ background: "rgba(0,0,0,0.25)" }}
            >
              Avatar
            </button>
          </div>

          <div className="absolute z-[52]" style={{ top: "max(8px, env(safe-area-inset-top, 8px))", right: "8px" }}>
            <span
              className="text-white/50 rounded-md px-2 py-1 text-[10px] font-medium inline-flex items-center gap-1"
              style={{ background: "rgba(0,0,0,0.25)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500/80" />
              {playerCount}
            </span>
          </div>
        </>
      )}

      {/* Mobile chat input */}
      {isMobile && chatOpen && (
        <div className="absolute left-0 right-0 z-[52]" style={{ bottom: "max(8px, env(safe-area-inset-bottom, 8px))" }}>
          <form onSubmit={handleChatSubmit} className="flex gap-1.5 mx-3">
            <input
              ref={chatInputRef}
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Say something..."
              maxLength={100}
              autoFocus
              className="flex-1 text-white text-[13px] rounded-lg px-3 py-2 border border-white/15
                placeholder:text-white/30 focus:outline-none focus:border-white/30"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
            />
            <button
              type="submit"
              className="cursor-pointer text-white/70 active:text-white rounded-lg px-3 py-2 text-[12px] font-medium"
              style={{ background: "rgba(0,0,0,0.5)" }}
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => { setChatOpen(false); chatInputRef.current?.blur(); }}
              className="cursor-pointer text-white/40 active:text-white/70 rounded-lg px-2 py-2 text-[12px]"
              style={{ background: "rgba(0,0,0,0.35)" }}
            >
              ✕
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
