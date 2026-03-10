"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Howl } from "howler";
import { TRACKS, loadRadioState, saveRadioState } from "@/lib/radio";

/* ── Module-level persistent audio state (survives unmount & page navigation) ── */
let _howl: Howl | null = null;
let _playing = false;
let _trackIndex = 0;
let _volume = 0.15;
let _muted = false;
let _shuffle = false;
let _initialized = false;
// Mutable ref to latest advanceTrack — avoids stale closures in Howl callbacks
let _advanceFn: ((currentIndex: number) => void) | null = null;

const DEFAULT_ACCENT = "#6090e0";
const DEFAULT_SHADOW = "#203870";

function destroyHowl(howl: Howl | null) {
  if (howl) {
    try { howl.unload(); } catch {}
  }
}

export default function LofiRadio() {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(_playing);
  const [trackIndex, setTrackIndex] = useState(_trackIndex);
  const [shuffle, setShuffle] = useState(_shuffle);
  const [volume, setVolume] = useState(_volume);
  const [muted, setMuted] = useState(_muted);

  // Mode state driven by events from main page
  const [flyMode, setFlyMode] = useState(false);
  const [raidMode, setRaidMode] = useState(false);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [shadow, setShadow] = useState(DEFAULT_SHADOW);

  const howlRef = useRef<Howl | null>(_howl);
  const fadingRef = useRef<Howl | null>(null);

  // ── Bootstrap: restore persistent Howl or load from localStorage ──
  useEffect(() => {
    if (_howl) {
      howlRef.current = _howl;
      setPlaying(_playing);
      setTrackIndex(_trackIndex);
      setVolume(_volume);
      setMuted(_muted);
      setShuffle(_shuffle);
    } else if (!_initialized) {
      const saved = loadRadioState();
      setVolume(saved.volume);
      setTrackIndex(saved.trackIndex);
      setShuffle(saved.shuffle);
      _volume = saved.volume;
      _trackIndex = saved.trackIndex;
      _shuffle = saved.shuffle;
    }
    _initialized = true;
  }, []);

  // ── Persist to localStorage ──
  useEffect(() => {
    if (!_initialized) return;
    saveRadioState({ volume, trackIndex, shuffle });
  }, [volume, trackIndex, shuffle]);

  // ── Keep module-level state in sync ──
  useEffect(() => { _volume = volume; }, [volume]);
  useEffect(() => { _muted = muted; }, [muted]);
  useEffect(() => { _shuffle = shuffle; }, [shuffle]);

  // ── Listen for mode events from main page ──
  useEffect(() => {
    const apply = (d: Record<string, unknown>) => {
      if (d.flyMode !== undefined) setFlyMode(d.flyMode as boolean);
      if (d.raidMode !== undefined) setRaidMode(d.raidMode as boolean);
      if (d.accent) setAccent(d.accent as string);
      if (d.shadow) setShadow(d.shadow as string);
    };

    // Read stored state for late-mounting (e.g. portal)
    const stored = (window as unknown as Record<string, unknown>).__gcRadioMode;
    if (stored) apply(stored as Record<string, unknown>);

    const handler = (e: Event) => apply((e as CustomEvent).detail);
    window.addEventListener("gc:radio-mode", handler);
    return () => {
      window.removeEventListener("gc:radio-mode", handler);
      setFlyMode(false);
      setRaidMode(false);
      setAccent(DEFAULT_ACCENT);
      setShadow(DEFAULT_SHADOW);
    };
  }, []);

  // ── Core playback ──
  const playTrack = useCallback((index: number, fadeIn = true) => {
    const old = howlRef.current;
    if (old) {
      fadingRef.current = old;
      old.fade(old.volume(), 0, 400);
      setTimeout(() => {
        destroyHowl(fadingRef.current);
        fadingRef.current = null;
      }, 450);
    }

    const track = TRACKS[index];
    if (!track) return;

    const vol = _muted ? 0 : _volume;
    const howl = new Howl({
      src: [track.src],
      html5: true,
      volume: fadeIn ? 0 : vol,
      onend: () => _advanceFn?.(index),
      onloaderror: () => _advanceFn?.(index),
      onplay: () => { setPlaying(true); _playing = true; },
    });

    howlRef.current = howl;
    _howl = howl;
    howl.play();
    if (fadeIn) howl.fade(0, vol, 400);
    setTrackIndex(index);
    _trackIndex = index;
    setPlaying(true);
    _playing = true;
  }, []);

  const advanceTrack = useCallback((currentIndex: number) => {
    let next: number;
    if (_shuffle) {
      do { next = Math.floor(Math.random() * TRACKS.length); }
      while (next === currentIndex && TRACKS.length > 1);
    } else {
      next = (currentIndex + 1) % TRACKS.length;
    }
    playTrack(next);
  }, [playTrack]);

  // Keep module-level advance fn in sync
  useEffect(() => { _advanceFn = advanceTrack; }, [advanceTrack]);

  const togglePlay = useCallback(() => {
    if (playing && howlRef.current) {
      howlRef.current.fade(howlRef.current.volume(), 0, 200);
      setTimeout(() => {
        howlRef.current?.pause();
        setPlaying(false);
        _playing = false;
      }, 200);
    } else if (howlRef.current) {
      howlRef.current.play();
      howlRef.current.fade(0, _muted ? 0 : _volume, 200);
      setPlaying(true);
      _playing = true;
    } else {
      playTrack(trackIndex);
    }
  }, [playing, trackIndex, playTrack]);

  const skipNext = useCallback(() => advanceTrack(trackIndex), [advanceTrack, trackIndex]);
  const skipPrev = useCallback(() => {
    const prev = trackIndex === 0 ? TRACKS.length - 1 : trackIndex - 1;
    playTrack(prev);
  }, [trackIndex, playTrack]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      _muted = next;
      if (howlRef.current) howlRef.current.volume(next ? 0 : _volume);
      return next;
    });
  }, []);

  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val);
    _volume = val;
    setMuted(false);
    _muted = false;
    if (howlRef.current) howlRef.current.volume(val);
  }, []);

  // ── Keyboard shortcut: M to mute ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "m") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      toggleMute();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleMute]);

  // ── Cleanup: preserve Howl on unmount, only destroy fading ref ──
  useEffect(() => {
    return () => {
      destroyHowl(fadingRef.current);
      _howl = howlRef.current;
    };
  }, []);

  // ── Sync volume to active Howl ──
  useEffect(() => {
    if (howlRef.current && playing) {
      howlRef.current.volume(muted ? 0 : volume);
    }
  }, [volume, muted, playing]);

  // ── Duck volume during raid mode ──
  useEffect(() => {
    if (!howlRef.current || !playing) return;
    if (raidMode) {
      howlRef.current.fade(howlRef.current.volume(), volume * 0.2, 500);
    } else {
      howlRef.current.fade(howlRef.current.volume(), muted ? 0 : volume, 500);
    }
  }, [raidMode, playing, volume, muted]);

  const currentTrack = TRACKS[trackIndex];

  return (
    <div className="relative">
      {/* Expanded panel — above button normally, to the right in fly mode */}
      {expanded && (
        <div
          className={`absolute z-25 border-[3px] border-border bg-bg-raised/95 backdrop-blur-sm ${
            flyMode ? 'bottom-0 left-full ml-2' : 'bottom-full left-0 mb-2'
          }`}
          style={{ animation: "fade-in 0.15s ease-out", boxShadow: `3px 3px 0 0 ${shadow}`, width: 200 }}
        >
      {/* Track name + close */}
      <div className="flex items-center justify-between gap-2 px-2.5 pt-2 pb-1">
        <span className="truncate text-[10px] text-cream">{currentTrack?.title ?? "No track"}</span>
        <button
          onClick={() => setExpanded(false)}
          className="btn-press shrink-0 text-[10px] text-muted hover:text-cream"
          title="Close"
        >
          &times;
        </button>
      </div>

      {/* Big controls row */}
      <div className="flex items-center justify-center gap-4 px-2.5 py-2">
        <button onClick={skipPrev} className="btn-press text-[12px] text-muted hover:text-cream" title="Previous track">
          {"\u25C0"}
        </button>
        <button
          onClick={togglePlay}
          className="btn-press flex h-8 w-8 items-center justify-center border-2 border-border hover:border-cream/40"
          style={{ color: playing ? accent : "var(--color-cream)" }}
          title={playing ? "Pause" : "Play"}
        >
          <span className="text-[14px]">{playing ? "\u23F8" : "\u25B6"}</span>
        </button>
        <button onClick={skipNext} className="btn-press text-[12px] text-muted hover:text-cream" title="Next track">
          {"\u25B6"}
        </button>
      </div>

      {/* Volume row */}
      <div className="flex items-center gap-2 px-2.5 pb-2">
        <button onClick={toggleMute} className="btn-press text-[9px] text-muted hover:text-cream shrink-0" title={muted ? "Unmute" : "Mute"}>
          {muted || volume === 0 ? "\uD83D\uDD07" : "\uD83D\uDD0A"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
          className="radio-volume flex-1"
          style={{ "--radio-accent": accent } as React.CSSProperties}
        />
        <button
          onClick={() => { setShuffle((s) => { _shuffle = !s; return !s; }); }}
          className="btn-press text-[9px] shrink-0"
          style={{ color: shuffle ? accent : "var(--color-muted)" }}
          title={shuffle ? "Shuffle: on" : "Shuffle: off"}
        >
          {"\uD83D\uDD00"}
        </button>
      </div>
        </div>
      )}

      {/* Collapsed button */}
      <button
        onClick={togglePlay}
        onContextMenu={(e) => { e.preventDefault(); setExpanded(true); }}
        className="btn-press flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm transition-all hover:border-border-light"
        style={{ borderColor: playing ? accent + "60" : undefined } as React.CSSProperties}
        title={playing ? "Pause music" : "Play music"}
      >
        <span style={{ color: playing ? accent : "var(--color-muted)" }}>
          {playing ? "\u23F8" : "\u25B6"}
        </span>
        <span className="text-cream max-w-20 truncate">
          {playing ? currentTrack?.title : "Lo-fi"}
        </span>
        <span
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          className="text-muted hover:text-cream ml-0.5"
          title="More controls"
        >
          {"\u2026"}
        </span>
      </button>
    </div>
  );
}
