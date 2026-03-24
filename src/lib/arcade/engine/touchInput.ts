import type { Direction } from "../types";

// ─── Configuration ───────────────────────────────────────────
const JOYSTICK_RADIUS = 44;
const JOYSTICK_THUMB_RADIUS = 16;
const DEAD_ZONE = 8;
const BUTTON_RADIUS = 20;
const BUTTON_HIT_RADIUS = BUTTON_RADIUS + 14;
const MOVE_INTERVAL = 0.15;

// ─── State ───────────────────────────────────────────────────
let joystickTouchId: number | null = null;
let joystickBaseX = 0;
let joystickBaseY = 0;
let joystickThumbX = 0;
let joystickThumbY = 0;
let joystickDir: Direction | null = null;
let joystickVisible = false;

let actionTouchId: number | null = null;
let actionDown = false;
let chatTouchId: number | null = null;
let chatDown = false;

let moveCallback: ((dir: Direction) => void) | null = null;
let moveCooldown = 0;

// Button positions (updated on render)
let vpW = 0;
let vpH = 0;

// Context label shown on the E button (e.g. "Sit", "Elevator")
let actionLabel = "";

export function setActionLabel(label: string): void {
  actionLabel = label;
}

function getActionBtnPos() {
  return { x: vpW - 40, y: vpH - 50 };
}

function getChatBtnPos() {
  return { x: vpW - 40, y: vpH - 108 };
}

// ─── Helpers ─────────────────────────────────────────────────
function canvasCoords(touch: Touch, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (touch.clientX - rect.left) * (canvas.width / rect.width),
    y: (touch.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function directionFromDelta(dx: number, dy: number): Direction {
  const angle = Math.atan2(dy, dx);
  if (angle >= -Math.PI / 4 && angle < Math.PI / 4) return "right";
  if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) return "down";
  if (angle >= (-3 * Math.PI) / 4 && angle < -Math.PI / 4) return "up";
  return "left";
}

function isInCircle(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

// ─── Attach / Detach ─────────────────────────────────────────
export function attachTouchInput(
  canvas: HTMLCanvasElement,
  onMove: (dir: Direction) => void,
  onAction: () => void,
  onChat: () => void,
  isTyping: () => boolean,
): () => void {
  moveCallback = onMove;

  const onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    if (isTyping()) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const { x, y } = canvasCoords(touch, canvas);

      const action = getActionBtnPos();
      if (isInCircle(x, y, action.x, action.y, BUTTON_HIT_RADIUS)) {
        actionDown = true;
        actionTouchId = touch.identifier;
        onAction();
        continue;
      }

      const chat = getChatBtnPos();
      if (isInCircle(x, y, chat.x, chat.y, BUTTON_HIT_RADIUS)) {
        chatDown = true;
        chatTouchId = touch.identifier;
        onChat();
        continue;
      }

      // Joystick: left half of screen
      if (x < canvas.width / 2 && joystickTouchId === null) {
        joystickTouchId = touch.identifier;
        joystickBaseX = x;
        joystickBaseY = y;
        joystickThumbX = x;
        joystickThumbY = y;
        joystickDir = null;
        joystickVisible = true;
      }
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier !== joystickTouchId) continue;

      const { x, y } = canvasCoords(touch, canvas);
      let dx = x - joystickBaseX;
      let dy = y - joystickBaseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > JOYSTICK_RADIUS) {
        dx = (dx / dist) * JOYSTICK_RADIUS;
        dy = (dy / dist) * JOYSTICK_RADIUS;
      }

      joystickThumbX = joystickBaseX + dx;
      joystickThumbY = joystickBaseY + dy;

      if (dist > DEAD_ZONE) {
        const newDir = directionFromDelta(dx, dy);
        if (newDir !== joystickDir) {
          joystickDir = newDir;
          moveCooldown = 0;
        }
      } else {
        joystickDir = null;
      }
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchId) {
        joystickTouchId = null;
        joystickDir = null;
        joystickVisible = false;
        moveCooldown = 0;
      }
      if (touch.identifier === actionTouchId) {
        actionTouchId = null;
        actionDown = false;
      }
      if (touch.identifier === chatTouchId) {
        chatTouchId = null;
        chatDown = false;
      }
    }
  };

  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

  return () => {
    moveCallback = null;
    joystickTouchId = null;
    joystickDir = null;
    joystickVisible = false;
    actionTouchId = null;
    actionDown = false;
    chatTouchId = null;
    chatDown = false;
    moveCooldown = 0;
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    canvas.removeEventListener("touchcancel", onTouchEnd);
  };
}

// ─── Update (called from game loop) ─────────────────────────
export function updateTouchMovement(dt: number): void {
  if (!joystickDir || !moveCallback) return;

  moveCooldown -= dt;
  if (moveCooldown <= 0) {
    moveCallback(joystickDir);
    moveCooldown = MOVE_INTERVAL;
  }
}

// ─── Render helpers ──────────────────────────────────────────
function drawRingButton(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  pressed: boolean, label: string, sublabel?: string,
): void {
  // Fill
  ctx.globalAlpha = pressed ? 0.3 : 0.1;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Ring
  ctx.globalAlpha = pressed ? 0.7 : 0.4;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  // Label
  ctx.globalAlpha = pressed ? 0.95 : 0.7;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 4);

  // Sublabel (context hint below button)
  if (sublabel) {
    ctx.globalAlpha = 0.5;
    ctx.font = "7px monospace";
    ctx.fillText(sublabel, x, y + r + 10);
  }
}

// ─── Render (called after ctx.restore, screen space) ─────────
export function renderTouchControls(
  ctx: CanvasRenderingContext2D,
  viewportWidth: number,
  viewportHeight: number,
): void {
  vpW = viewportWidth;
  vpH = viewportHeight;

  // Joystick
  if (joystickVisible) {
    // Base ring
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(joystickBaseX, joystickBaseY, JOYSTICK_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(joystickBaseX, joystickBaseY, JOYSTICK_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // Thumb
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(joystickThumbX, joystickThumbY, JOYSTICK_THUMB_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(joystickThumbX, joystickThumbY, JOYSTICK_THUMB_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Idle hint — subtle D-pad
    const hx = 48;
    const hy = vpH - 56;

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(hx, hy, JOYSTICK_RADIUS - 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hx, hy, JOYSTICK_RADIUS - 4, 0, Math.PI * 2);
    ctx.stroke();

    // Small crosshair lines
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    const len = 8;
    ctx.beginPath();
    ctx.moveTo(hx, hy - len); ctx.lineTo(hx, hy + len);
    ctx.moveTo(hx - len, hy); ctx.lineTo(hx + len, hy);
    ctx.stroke();
  }

  const action = getActionBtnPos();
  const chat = getChatBtnPos();

  drawRingButton(ctx, action.x, action.y, BUTTON_RADIUS, actionDown, "E", actionLabel || undefined);
  drawRingButton(ctx, chat.x, chat.y, BUTTON_RADIUS, chatDown, "Chat");

  ctx.globalAlpha = 1;
}
