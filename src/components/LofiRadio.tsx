"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Howl } from "howler";
import { TRACKS, loadRadioState, saveRadioState } from "@/lib/radio";

interface LofiRadioProps {
  accent: string;
  shadow: string;
  flyMode: boolean;
  raidMode?: boolean;
}

export default function LofiRadio({ accent, shadow, flyMode, raidMode }: LofiRadioProps) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [muted, setMuted] = useState(false);

  const howlRef = useRef<Howl | null>(null);
  const fadingRef = useRef<Howl | null>(null);
  const initRef = useRef(false);

  // Load persisted state on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const saved = loadRadioState();
    setVolume(saved.volume);
    setTrackIndex(saved.trackIndex);
    setShuffle(saved.shuffle);
  }, []);


  // Persist state changes
  useEffect(() => {
    if (!initRef.current) return;
    saveRadioState({ volume, trackIndex, shuffle });
  }, [volume, trackIndex, shuffle]);

  const destroyHowl = useCallback((howl: Howl | null) => {
    if (howl) {
      try { howl.unload(); } catch {}
    }
  }, []);

  const playTrack = useCallback((index: number, fadeIn = true) => {
    // Fade out current track
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

    const howl = new Howl({
      src: [track.src],
      html5: true,
      volume: fadeIn ? 0 : (muted ? 0 : volume),
      onend: () => {
        // Auto-advance
        advanceTrack(index);
      },
      onloaderror: () => {
        // Skip broken tracks
        advanceTrack(index);
      },
      onplay: () => setPlaying(true),
    });

    howlRef.current = howl;
    howl.play();
    if (fadeIn) {
      howl.fade(0, muted ? 0 : volume, 400);
    }
    setTrackIndex(index);
    setPlaying(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, muted, destroyHowl]);

  const advanceTrack = useCallback((currentIndex: number) => {
    let next: number;
    if (shuffle) {
      do { next = Math.floor(Math.random() * TRACKS.length); }
      while (next === currentIndex && TRACKS.length > 1);
    } else {
      next = (currentIndex + 1) % TRACKS.length;
    }
    playTrack(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffle]);

  const togglePlay = useCallback(() => {
    if (playing && howlRef.current) {
      howlRef.current.fade(howlRef.current.volume(), 0, 200);
      setTimeout(() => {
        howlRef.current?.pause();
        setPlaying(false);
      }, 200);
    } else if (howlRef.current) {
      howlRef.current.play();
      howlRef.current.fade(0, muted ? 0 : volume, 200);
      setPlaying(true);
    } else {
      playTrack(trackIndex);
    }
  }, [playing, muted, volume, trackIndex, playTrack]);

  const skipNext = useCallback(() => {
    advanceTrack(trackIndex);
  }, [advanceTrack, trackIndex]);

  const skipPrev = useCallback(() => {
    const prev = trackIndex === 0 ? TRACKS.length - 1 : trackIndex - 1;
    playTrack(prev);
  }, [trackIndex, playTrack]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (howlRef.current) {
        howlRef.current.volume(next ? 0 : volume);
      }
      return next;
    });
  }, [volume]);

  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val);
    setMuted(false);
    if (howlRef.current) {
      howlRef.current.volume(val);
    }
  }, []);

  // Keyboard shortcut: M to mute
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyHowl(howlRef.current);
      destroyHowl(fadingRef.current);
    };
  }, [destroyHowl]);

  // Update volume on existing Howl when volume/muted changes
  useEffect(() => {
    if (howlRef.current && playing) {
      howlRef.current.volume(muted ? 0 : volume);
    }
  }, [volume, muted, playing]);

  // Duck volume during raid mode
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
      {/* Expanded panel — pops up above the button */}
      {expanded && (
        <div
          className="absolute bottom-full left-0 mb-2 z-[25] border-[3px] border-border bg-bg-raised/95 backdrop-blur-sm"
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
          className="btn-press flex h-[32px] w-[32px] items-center justify-center border-[2px] border-border hover:border-cream/40"
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
          onClick={() => setShuffle((s) => !s)}
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
        title={playing ? "Pause music 暂停音乐" : "Play music 播放音乐"}
      >
        <span style={{ color: playing ? accent : "var(--color-muted)" }}>
          {playing ? "\u23F8" : "\u25B6"}
        </span>
        <span className="text-cream max-w-[80px] truncate">
          {playing ? currentTrack?.title : "Lo-fi"}
        </span>
        <span
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          className="text-muted hover:text-cream ml-0.5"
          title="More controls 更多控制"
        >
          {"\u2026"}
        </span>
      </button>
    </div>
  );
}
