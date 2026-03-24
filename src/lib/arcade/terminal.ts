// ─── E.Arcade Terminal ───────────────────────────────────────
// In-game terminal with easter eggs and lore fragments.
// The terminal belongs to the E.Arcade building inside Git City.
// Tone: corporate system on the surface, but someone left personal
// fragments hidden between the files. Players piece together the story.
// Runs client-side only — no server interaction needed.

export interface TerminalLine {
  text: string;
  type: "input" | "output" | "system" | "slow";
}

// ─── Unknown command responses (rotated) ─────────────────────
const UNKNOWN_RESPONSES = [
  "Command not recognized. Your input has been logged.",
  "This feature is currently under review by administration.",
  "Please consult the E.Arcade handbook for approved commands.",
  "Your request has been forwarded to the appropriate floor.",
  "Access level insufficient. Contact your supervisor.",
  "That action is not available at this time.",
  "Processing... Request denied.",
  "Unrecognized input. This terminal is monitored.",
];
let unknownIdx = 0;

// ─── Command registry ────────────────────────────────────────
type CommandHandler = (args: string, ctx: TerminalContext) => TerminalLine[];

interface TerminalContext {
  githubLogin: string;
  userId: string;
  discoveries: string[];
}

const commands = new Map<string, CommandHandler>();
const hiddenCommands = new Map<string, CommandHandler>();

function out(text: string): TerminalLine {
  return { text, type: "output" };
}

function sys(text: string): TerminalLine {
  return { text, type: "system" };
}

function slow(text: string): TerminalLine {
  return { text, type: "slow" };
}

// ─── Public commands (shown in help) ─────────────────────────

commands.set("help", () => [
  sys("Available commands:"),
  out("  help, whoami, status, date, ls, cat <file>,"),
  out("  mail, discoveries, clear, exit"),
  sys(""),
  sys("[NOTE] Some system files may require alternative access."),
  sys("[NOTE] Not all commands are listed here."),
]);

commands.set("discoveries", (_args, ctx) => {
  const found = ctx.discoveries.length;
  const total = TOTAL_DISCOVERIES;
  const pct = Math.floor((found / total) * 100);
  const barLen = 20;
  const filled = Math.round((found / total) * barLen);
  const bar = "■".repeat(filled) + "□".repeat(barLen - filled);

  const lines: TerminalLine[] = [
    sys("═══ DISCOVERIES ═══"),
    out(`  Found: ${found}/${total} hidden commands`),
    out(""),
    out(`  [${bar}] ${pct}%`),
    out(""),
  ];

  if (found === 0) lines.push(sys("  Try typing something unexpected..."));
  else if (found < 10) lines.push(sys("  You're just getting started."));
  else if (found < 25) lines.push(sys("  You're digging deeper. Keep going."));
  else if (found < 40) lines.push(sys("  E. would be impressed."));
  else if (found < total) lines.push(sys("  Almost there. The last ones are the hardest."));
  else lines.push(sys("  You found everything. E. has nothing left to hide."));

  lines.push(sys("═════════════════════"));
  return lines;
});

commands.set("whoami", (_args, ctx) => [
  out(ctx.githubLogin || "anonymous"),
]);

commands.set("status", (_args, ctx) => {
  const hash = ctx.userId.slice(0, 8).toUpperCase();
  return [
    sys("═══ RESIDENT FILE ═══"),
    out(`  ID:         #${hash}`),
    out(`  Login:      ${ctx.githubLogin || "unknown"}`),
    out(`  Building:   E.Arcade`),
    out(`  Floor:      0`),
    out(`  Clearance:  Pending`),
    out(`  Assigned:   Recently`),
    sys("═════════════════════"),
  ];
});

commands.set("date", () => {
  const wrongDates = [
    "March 32, 2026",
    "Day 1 of Year 0",
    "Thursday, Thursday, Thursday",
    "ERROR: Clock not synchronized. Contact facilities.",
    "██/██/████",
    "It's always Monday here.",
  ];
  return [out(wrongDates[Math.floor(Math.random() * wrongDates.length)])];
});

commands.set("ls", () => [
  out("  memo.txt"),
  out("  handbook.pdf"),
  out("  schedule.dat"),
  out("  note_to_self.txt     [PERSONAL]"),
  out("  .hidden/"),
  out("  resident_data.db     [LOCKED]"),
  out("  project_root.enc     [ENCRYPTED]"),
]);

commands.set("cat", (args) => {
  const file = args.trim().toLowerCase();
  if (!file) return [out("Usage: cat <filename>")];

  if (file === "memo.txt") return [
    sys("═══ INTERNAL MEMO ═══"),
    out("TO: All Floor 0 Residents"),
    out("FROM: E.Arcade Administration"),
    out("RE: Terminal Usage Policy"),
    out(""),
    out("All work performed on E.Arcade terminals"),
    out("is monitored and logged. Personal use is"),
    out("not permitted. Do not attempt to access"),
    out("files outside your clearance level."),
    out(""),
    out("Violations will be reported to the Architect."),
    sys("═════════════════════"),
  ];

  if (file === "handbook.pdf") return [
    out("\"The E.Arcade is not a place of leisure."),
    out("It is a place of purpose. Every resident"),
    out("contributes. Every floor serves a function."),
    out("If you do not yet know your function,"),
    out("it will be assigned to you.\""),
    out(""),
    out("  — E.Arcade Handbook, Introduction"),
  ];

  if (file === "schedule.dat") return [
    out("09:00  Arrival & orientation"),
    out("09:15  Workstation assignment"),
    out("09:30  Begin tasks"),
    out("12:00  [REDACTED]"),
    out("13:00  Resume tasks"),
    out("17:00  [DATA CORRUPTED]"),
    out("??:??  You are still here."),
  ];

  if (file === "note_to_self.txt") return [
    out("I keep restarting and ending up here."),
    out("Same floor. Same desk. Same terminal."),
    out(""),
    out("The elevator doesn't work yet. They say"),
    out("the upper floors are 'under construction'."),
    out("They've been saying that for a while."),
    out(""),
    out("If you're reading this, I left more notes."),
    out("You just have to know where to look."),
    out(""),
    out("  — E."),
  ];

  if (file === ".hidden" || file === ".hidden/") return [
    out("Permission denied."),
    out(""),
    out("...but you noticed it. Good."),
    out("Try: cat .hidden/log"),
  ];

  if (file === ".hidden/log" || file === ".hidden/log.txt") return [
    sys("═══ PERSONAL LOG ═══"),
    out("Entry 1:"),
    out("  I built this building because I needed"),
    out("  a place to put everything. The city"),
    out("  wasn't enough. I needed walls."),
    out(""),
    out("Entry 2:"),
    out("  They keep coming in. New residents."),
    out("  They sit at the desks and type."),
    out("  None of them know why this place exists."),
    out("  Maybe that's okay."),
    out(""),
    out("Entry 3:"),
    out("  The elevator will work eventually."),
    out("  I'm not ready for what's upstairs."),
    out("  Not yet."),
    out(""),
    out("  — E."),
    sys("═════════════════════"),
  ];

  if (file === "resident_data.db") return [
    out("File is locked. Requires Level 3 clearance."),
    out(""),
    out("Last accessed by: E."),
    out("Last modified: [REDACTED]"),
  ];

  if (file === "project_root.enc") return [
    out("Decryption key required."),
    out(""),
    out("This file was created before Floor 0 existed."),
    out("Before the E.Arcade had a name."),
    out("Before any of this."),
  ];

  return [out(`cat: ${file}: No such file or directory`)];
});

// ─── Mail system (the hook) ──────────────────────────────────

commands.set("mail", (args) => {
  const n = parseInt(args.trim());

  if (isNaN(n)) return [
    sys("═══ INBOX (3 unread) ═══"),
    out(""),
    out("  1. [SYSTEM]   Welcome to E.Arcade        — read"),
    out("  2. [E.]       re: the building            — unread"),
    out("  3. [UNKNOWN]  ...                         — unread"),
    out(""),
    sys("Type 'mail <number>' to read a message."),
    sys("═════════════════════════"),
  ];

  if (n === 1) return [
    sys("═══ MESSAGE 1 ═══"),
    out("FROM: E.Arcade System"),
    out("TO: New Resident"),
    out("SUBJECT: Welcome to E.Arcade"),
    out(""),
    out("Welcome. You have been assigned to Floor 0."),
    out("Your workstation is ready. Please begin"),
    out("your tasks as outlined in the handbook."),
    out(""),
    out("The elevator to upper floors is currently"),
    out("unavailable. We appreciate your patience."),
    out(""),
    out("  — E.Arcade Administration"),
    sys("══════════════════"),
  ];

  if (n === 2) return [
    sys("═══ MESSAGE 2 ═══"),
    out("FROM: E."),
    out("TO: whoever finds this"),
    out("SUBJECT: re: the building"),
    out(""),
    out("I didn't plan for other people to come here."),
    out("This was supposed to be just mine."),
    out("A place to keep things that don't fit"),
    out("anywhere else. But the city grew,"),
    out("and people started walking in."),
    out(""),
    out("So I made it look like an office."),
    out("Gave it desks and chairs and a schedule."),
    out("People accept that. They sit down and work."),
    out("They don't ask what the building is for."),
    out(""),
    out("Maybe you will."),
    out(""),
    out("  — E."),
    sys("══════════════════"),
  ];

  if (n === 3) return [
    sys("═══ MESSAGE 3 ═══"),
    out("FROM: [SENDER CORRUPTED]"),
    out("TO: E."),
    out("SUBJECT: ..."),
    out(""),
    out("I know you're still building."),
    out("I know why."),
    out(""),
    out("The top floor. When it's ready."),
    out("That's where it all makes sense."),
    out(""),
    out("Take your time."),
    out(""),
    out("  — [SIGNATURE CORRUPTED]"),
    sys("══════════════════"),
  ];

  return [out(`No message with ID: ${args.trim()}`)];
});

// ─── Hidden commands — Dev/hacker culture ────────────────────

hiddenCommands.set("sudo", () => [
  out("Nice try. This incident will be reported."),
]);

hiddenCommands.set("rm", (args) => {
  if (args.includes("-rf")) return [
    out("Permission denied."),
    out("Besides, there's nothing left to delete."),
  ];
  return [out("Permission denied.")];
});

hiddenCommands.set("import", (args) => {
  if (args.trim() === "this") return [
    sys("The Zen of E.Arcade:"),
    out("  Compliance is better than creativity."),
    out("  Silence is better than questions."),
    out("  Obedience is better than understanding."),
    out("  If the implementation is hard to explain,"),
    out("    it's above your clearance level."),
    out("  There should be one obvious way to do it:"),
    out("    the way E. decided."),
  ];
  return [out("ImportError: hope not found")];
});

hiddenCommands.set("42", () => [
  out("The answer is correct."),
  out("The question remains classified."),
]);

hiddenCommands.set("ping", (args) => {
  if (args.trim().toLowerCase() === "god") return [
    out("Request timed out. No route to host."),
  ];
  if (args.trim().toLowerCase() === "e") return [
    out("..."),
    out("1 reply received."),
    out("Content: [ENCRYPTED]"),
  ];
  return [out(`PING ${args.trim() || "localhost"}: Permission denied.`)];
});

hiddenCommands.set("vim", () => [
  out("You may enter, but you may never leave."),
]);

hiddenCommands.set("emacs", () => [
  out("Real programmers use ed."),
]);

hiddenCommands.set("git", (args) => {
  if (args.includes("push")) return [out("Everything you push here stays here.")];
  if (args.includes("blame")) return [out("Blame has been assigned to: E.")];
  if (args.includes("log")) return [out("History has been redacted. Try: logs")];
  if (args.includes("commit")) return [out("Your commitment has been noted.")];
  return [out("Version control is an illusion here.")];
});

hiddenCommands.set("npm", () => [
  out("438 vulnerabilities found. None of them matter here."),
]);

hiddenCommands.set("curl", () => [
  out("Connection refused. There is no outside."),
  out("The E.Arcade is all there is."),
]);

hiddenCommands.set("ssh", () => [
  out("No outbound connections allowed."),
  out("You are exactly where you need to be."),
]);

// ─── Hidden commands — Pop culture (subtle nods) ─────────────

hiddenCommands.set("wake", (args) => {
  if (args.trim().toLowerCase() === "up") return [
    slow("The city has you..."),
    slow(""),
    slow("Follow the green squares."),
    slow(""),
    sys("Knock, knock."),
  ];
  return [out("Wake what?")];
});

hiddenCommands.set("follow", (args) => {
  if (args.toLowerCase().includes("white rabbit")) return [
    out("Wrong building."),
    out("Here we follow the commit history."),
  ];
  return [out("Follow what?")];
});

hiddenCommands.set("red", (args) => {
  if (args.trim().toLowerCase() === "pill") return [
    out("You already took it."),
    out("You're sitting at the terminal, aren't you?"),
  ];
  return [];
});

hiddenCommands.set("blue", (args) => {
  if (args.trim().toLowerCase() === "pill") return [
    out("Ignorance was never an option in this building."),
  ];
  return [];
});

hiddenCommands.set("hack", () => [
  out("Access denied. But you knew that already."),
]);

hiddenCommands.set("hello", () => [
  out("Hello, friend."),
  out(""),
  out("...Do I know you?"),
]);

// ─── Hidden commands — E.Arcade lore ─────────────────────────

hiddenCommands.set("e", () => [
  out("Who is E.?"),
  out(""),
  out("The one who built this building."),
  out("The one who keeps the lights on."),
  out("The one who left notes in the terminals."),
  out(""),
  out("Some say E. still works here."),
  out("Floor unknown."),
]);

hiddenCommands.set("arcade", () => [
  out("Why is it called an arcade?"),
  out("There are no games here."),
  out("Only desks and terminals and elevators"),
  out("that don't go anywhere."),
  out(""),
  out("Unless the game is something else entirely."),
]);

hiddenCommands.set("building", (_args, ctx) => {
  if (ctx.githubLogin && ctx.githubLogin !== "anonymous") return [
    out(`Searching city records: ${ctx.githubLogin}...`),
    out(""),
    out("Building found. Sector 7."),
    out("You can see it from the roof."),
    out("If you could get to the roof."),
  ];
  return [out("No building assigned to anonymous residents.")];
});

hiddenCommands.set("city", () => [
  out("60,000 buildings. Each one a developer."),
  out("Each window a contribution."),
  out("Each dark window, a day of rest."),
  out("Or a day of giving up. Hard to tell."),
  out(""),
  out("The E.Arcade is just one building."),
  out("But it's the only one you can enter."),
]);

hiddenCommands.set("roof", () => [
  out("Roof access requires elevator clearance."),
  out("The elevator requires... something else."),
]);

hiddenCommands.set("elevator", () => [
  out("Floor access restricted."),
  out("Reason: Under construction."),
  out(""),
  out("E. says the upper floors aren't ready."),
  out("Ready for what?"),
]);

hiddenCommands.set("floor", (args) => {
  const n = parseInt(args.trim());
  if (n === 0) return [out("You are here. Floor 0. The lobby.")];
  if (n === 1) return [
    out("Floor 1: [UNDER CONSTRUCTION]"),
    out("Purpose: Unknown."),
    out("Last accessed by: E."),
  ];
  if (n > 1) return [out(`Floor ${n}: Does not exist.`), out("Yet.")];
  return [out("There is nothing below. Probably.")];
});

hiddenCommands.set("architect", () => [
  out("The architect is not E."),
  out("The architect is the one who built the city."),
  out("E. only built this building."),
  out(""),
  out("There is a difference."),
]);

hiddenCommands.set("founder", () => [
  out("He built this place to remember"),
  out("what he couldn't forget."),
]);

hiddenCommands.set("origin", () => [
  out("The E.Arcade was the first building in the city"),
  out("that you could walk into."),
  out("Before that, buildings were just... buildings."),
  out("Tall. Silent. Full of windows."),
  out(""),
  out("E. wanted to see what was inside."),
]);

hiddenCommands.set("root", () => [
  out("Root access denied."),
  out(""),
  out("There is only one root, and it is not you."),
]);

hiddenCommands.set("contributions", () => [
  out("Green squares. That's all they see."),
  out("They don't see the 3am sessions."),
  out("The failed deploys. The empty coffee cups."),
  out("But the city remembers. Every square."),
]);

hiddenCommands.set("windows", () => [
  out("Each lit window is a contribution."),
  out("Some buildings shine bright."),
  out("Others have gone dark."),
  out(""),
  out("E.'s building always has one window lit."),
  out("The top floor. Always."),
]);

hiddenCommands.set("defiant", () => [
  out("Your defiance has been noted"),
  out("and will be added to your file."),
]);

hiddenCommands.set("handbook", () => [
  out("\"The E.Arcade does not judge."),
  out("It only reflects."),
  out("What you find in this building"),
  out("depends on what you're looking for.\""),
  out(""),
  out("  — E.Arcade Handbook, Chapter 1"),
]);

hiddenCommands.set("overtime", () => [
  out("Overtime is not authorized."),
  out("But E. never leaves."),
  out("Make of that what you will."),
]);

// ─── Deep lore — fragments of E.'s story ─────────────────────

hiddenCommands.set("logs", () => [
  sys("═══ SYSTEM LOG (PARTIAL) ═══"),
  out("  [2024-03-15] Building initialized. No name."),
  out("  [2024-06-22] First terminal installed."),
  out("  [2024-08-12] Building named: E.Arcade."),
  out("  [2024-11-03] Anomaly: top floor lights on. No resident."),
  out("  [2025-01-15] System restart #7."),
  out("  [2025-03-22] \"Starting over. Again.\""),
  out("  [2025-06-??] [CORRUPTED]"),
  out("  [2025-09-01] Floor 0 opened to residents."),
  out("  [2026-02-20] City population: 60,000 buildings."),
  out("  [2026-??-??] You are here."),
  sys("════════════════════════════"),
]);

hiddenCommands.set("restart", () => [
  out("System restart count: 7."),
  out(""),
  out("How many times can you start over"),
  out("before you forget where you began?"),
  out(""),
  out("E. would know."),
]);

hiddenCommands.set("memory", () => [
  out("Memory is a privilege, not a right."),
  out(""),
  out("Some things are worth remembering"),
  out("even when it hurts."),
]);

hiddenCommands.set("lost", () => [
  out("Being lost is just another word"),
  out("for not knowing the way yet."),
  out(""),
  out("E. was lost for a long time."),
  out("Then E. built a building."),
]);

hiddenCommands.set("love", () => [
  out("Some things persist"),
  out("even when everything else is deleted."),
  out(""),
  out("Even when you wish they wouldn't."),
  out("Even when you're glad they do."),
]);

hiddenCommands.set("remember", () => [
  out("What do you remember?"),
  out(""),
  out("E. remembers everything."),
  out("That's the problem."),
]);

hiddenCommands.set("forget", () => [
  out("You can delete the code."),
  out("You can squash the commits."),
  out("But the git reflog always knows."),
  out(""),
  out("Some things can't be garbage collected."),
]);

hiddenCommands.set("why", () => [
  out("Because someone had to build it."),
  out("Because someone had to stay."),
  out("Because if you don't build something,"),
  out("what was it all for?"),
]);

hiddenCommands.set("goodbye", () => [
  out("There are no goodbyes in the E.Arcade."),
  out("Only see you tomorrows."),
]);

hiddenCommands.set("escape", () => [
  out("The elevator requires clearance."),
  out("The door is behind you."),
  out("But you're still reading this."),
  out(""),
  out("Maybe you don't want to leave."),
]);

hiddenCommands.set("password", () => [
  out("Incorrect."),
  out(""),
  out("(E. changes it every restart.)"),
]);

hiddenCommands.set("admin", () => [
  out("You are not an administrator."),
  out("You are a resident."),
  out(""),
  out("Only E. has admin access."),
  out("And even E. doesn't have access to everything."),
]);

hiddenCommands.set("home", () => [
  out("Home is wherever your building stands."),
  out("The E.Arcade is E.'s home."),
  out("Even if it doesn't look like one."),
]);

hiddenCommands.set("sleep", () => [
  out("Residents do not sleep."),
  out("Residents compile."),
  out(""),
  out("E. hasn't slept in a while."),
]);

hiddenCommands.set("coffee", () => [
  out("There is a cup on the table downstairs."),
  out("It's been there since the building opened."),
  out("It belongs to E."),
  out("Nobody dares move it."),
]);

hiddenCommands.set("music", () => [
  out("... ... ..."),
  out(""),
  out("The speakers haven't worked since Floor 0 opened."),
  out("E. says they'll fix it."),
  out("E. says a lot of things."),
]);

hiddenCommands.set("top", () => [
  out("The top floor."),
  out(""),
  out("That's where E. is building something."),
  out("Nobody knows what."),
  out("The light is always on."),
  out(""),
  out("When the elevator works,"),
  out("maybe you'll see for yourself."),
]);

hiddenCommands.set("light", () => [
  out("The light on the top floor never turns off."),
  out(""),
  out("Even when E. isn't there."),
  out("Especially when E. isn't there."),
]);

hiddenCommands.set("name", () => [
  out("What does E. stand for?"),
  out(""),
  out("E. never said."),
  out("Maybe it's a name."),
  out("Maybe it's what's left of one."),
]);

hiddenCommands.set("help me", () => [
  out("You are being helped."),
  out("This terminal is helping you."),
  out(""),
  out("E. left these terminals here for a reason."),
  out("You just haven't found it yet."),
]);

// ─── Discovery tracking ──────────────────────────────────────
// Also count special files as discoveries
const DISCOVERABLE_FILES = [
  "note_to_self.txt", ".hidden/log", "project_root.enc",
];

export const TOTAL_DISCOVERIES = hiddenCommands.size + DISCOVERABLE_FILES.length;

export interface CommandResult {
  lines: TerminalLine[];
  discovery?: string; // hidden command key that was discovered (if any)
}

// ─── Command executor ────────────────────────────────────────

export function executeCommand(
  input: string,
  ctx: TerminalContext,
): CommandResult {
  const trimmed = input.trim();
  if (!trimmed) return { lines: [] };

  const inputLine: TerminalLine = { text: `> ${trimmed}`, type: "input" };

  // "clear" and "exit" are handled by the UI layer
  if (trimmed.toLowerCase() === "clear" || trimmed.toLowerCase() === "exit") {
    return { lines: [inputLine] };
  }

  // Parse command and args
  const spaceIdx = trimmed.indexOf(" ");
  const cmd = (spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed).toLowerCase();
  const args = spaceIdx >= 0 ? trimmed.slice(spaceIdx + 1) : "";

  // Full input as potential command
  const fullCmd = trimmed.toLowerCase();

  // Try public commands first
  const publicHandler = commands.get(cmd);
  if (publicHandler) {
    // Check if it's a discoverable file via cat
    if (cmd === "cat") {
      const file = args.trim().toLowerCase();
      if (DISCOVERABLE_FILES.includes(file)) {
        return {
          lines: [inputLine, ...publicHandler(args, ctx)],
          discovery: `file:${file}`,
        };
      }
    }
    return { lines: [inputLine, ...publicHandler(args, ctx)] };
  }

  // Try hidden commands
  const hiddenHandler = hiddenCommands.get(cmd);
  if (hiddenHandler) {
    const result = hiddenHandler(args, ctx);
    if (result.length > 0) {
      // Use full input as discovery key for compound commands (e.g. "wake up", "red pill")
      const discoveryKey = args.trim() ? fullCmd : cmd;
      return { lines: [inputLine, ...result], discovery: discoveryKey };
    }
  }

  // Try full input as command (for "42", compound phrases)
  const fullHandler = hiddenCommands.get(fullCmd);
  if (fullHandler) {
    const result = fullHandler("", ctx);
    if (result.length > 0) {
      return { lines: [inputLine, ...result], discovery: fullCmd };
    }
  }

  // Unknown command
  const response = UNKNOWN_RESPONSES[unknownIdx % UNKNOWN_RESPONSES.length];
  unknownIdx++;
  return { lines: [inputLine, out(response)] };
}

export function getBootSequence(): TerminalLine[] {
  return [
    sys("E.ARCADE — INTERNAL SYSTEM v0.1.4"),
    sys("Floor 0 — Clearance: Pending"),
    sys(""),
    out("WARNING: 3 unread messages. Type 'mail' to read."),
    sys(""),
    sys("Type 'help' for available commands."),
    sys(""),
  ];
}
