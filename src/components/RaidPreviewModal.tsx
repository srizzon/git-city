"use client";

import { useState, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { RaidPreviewResponse, RaidBoostItem } from "@/lib/raid";
import { VehicleMesh } from "@/components/RaidSequence3D";

interface Props {
  preview: RaidPreviewResponse;
  loading: boolean;
  error: string | null;
  onRaid: (boostPurchaseId?: number, vehicleId?: string) => void;
  onCancel: () => void;
}

const ESTIMATE_CONFIG = {
  weak: { label: "WEAK", color: "#ff4444", bars: 1 },
  medium: { label: "MEDIUM", color: "#ffaa22", bars: 2 },
  strong: { label: "STRONG", color: "#44ff44", bars: 3 },
} as const;

function StrengthBar({
  estimate,
  label,
  score,
  breakdown,
}: {
  estimate: "weak" | "medium" | "strong";
  label: string;
  score: number;
  breakdown: { commits: number; streak: number; kudos: number };
}) {
  const config = ESTIMATE_CONFIG[estimate];
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-4 w-3"
            style={{
              backgroundColor: i <= config.bars ? config.color : "#333",
              opacity: i <= config.bars ? 1 : 0.3,
            }}
          />
        ))}
      </div>
      <span className="text-sm font-bold tabular-nums" style={{ color: config.color }}>
        {score}
      </span>
      <div className="flex flex-col items-center gap-0.5 text-[8px] text-muted/70">
        {breakdown.commits > 0 && <span>commits {breakdown.commits}</span>}
        {breakdown.streak > 0 && <span>streak {breakdown.streak}</span>}
        {breakdown.kudos > 0 && <span>kudos {breakdown.kudos}</span>}
        {breakdown.commits === 0 && breakdown.streak === 0 && breakdown.kudos === 0 && (
          <span>no stats | 无统计数据</span>
        )}
      </div>
    </div>
  );
}

function SpinningVehicle({ type }: { type: string }) {
  const groupRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.8;
  });
  return (
    <group ref={groupRef}>
      <VehicleMesh type={type} />
    </group>
  );
}

export default function RaidPreviewModal({ preview, loading, error, onRaid, onCancel }: Props) {
  const [selectedBoost, setSelectedBoost] = useState<RaidBoostItem | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState(preview.vehicle);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="mx-4 w-full max-w-sm border-[2px] border-red-500/60 bg-bg-raised/95 p-5 backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 text-center">
          <h2 className="font-silkscreen text-sm uppercase tracking-wider text-red-400">
            Raid Preview |  raid预览
          </h2>
          <p className="mt-1 text-[10px] text-muted whitespace-pre-line">
            {preview.raids_today}/{preview.raids_max} raids used today \n 已使用{preview.raids_today}/{preview.raids_max} 次
          </p>
        </div>

        {/* Vehicle Preview */}
        <div className="relative mb-3 h-28 w-full overflow-hidden border border-cream/10 bg-black/40">
          <Canvas camera={{ position: [0, 3, 10], fov: 40 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} />
            <SpinningVehicle type={selectedVehicle} />
          </Canvas>
          <p className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-wider text-muted/70">
            {preview.available_vehicles.find((v) => v.item_id === selectedVehicle)?.name ?? selectedVehicle}
          </p>
        </div>

        {/* Vehicle Selector */}
        {preview.available_vehicles.length > 1 && (
          <div className="mb-4">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">Vehicle | 车辆</p>
            <div className="flex gap-2">
              {preview.available_vehicles.map((v) => (
                <button
                  key={v.item_id}
                  onClick={() => setSelectedVehicle(v.item_id)}
                  className={`flex-1 border px-2 py-1.5 text-[10px] transition-colors ${
                    selectedVehicle === v.item_id
                      ? "border-red-400/60 bg-red-500/10 text-red-300"
                      : "border-cream/10 text-muted hover:border-cream/20"
                  }`}
                >
                  {v.emoji} {v.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* VS Section */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            <div className="mb-1 flex items-center justify-center gap-1.5">
              {preview.attacker_avatar && (
                <img
                  src={preview.attacker_avatar}
                  alt=""
                  className="h-4 w-4 rounded-full"
                />
              )}
              <p className="truncate text-xs font-bold text-cream">
                {preview.attacker_login}
              </p>
            </div>
            <StrengthBar
              estimate={preview.attack_estimate}
              label="Attack"
              score={preview.attack_score}
              breakdown={preview.attack_breakdown}
            />
          </div>

          <span className="font-silkscreen text-lg text-red-500">VS</span>

          <div className="flex-1 text-center">
            <div className="mb-1 flex items-center justify-center gap-1.5">
              {preview.defender_avatar && (
                <img
                  src={preview.defender_avatar}
                  alt=""
                  className="h-4 w-4 rounded-full"
                />
              )}
              <p className="truncate text-xs font-bold text-cream">
                {preview.defender_login}
              </p>
            </div>
            <StrengthBar
              estimate={preview.defense_estimate}
              label="Defense"
              score={preview.defense_score}
              breakdown={preview.defense_breakdown}
            />
          </div>
        </div>

        {/* Boost Selector */}
        {preview.available_boosts.length > 0 && (
          <div className="mb-4">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">
              Use Boost
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedBoost(null)}
                className={`flex-1 border px-2 py-1.5 text-[10px] transition-colors ${
                  !selectedBoost
                    ? "border-cream/40 bg-cream/10 text-cream"
                    : "border-cream/10 text-muted hover:border-cream/20"
                }`}
              >
                None | 无
              </button>
              {preview.available_boosts.map((boost) => (
                <button
                  key={boost.purchase_id}
                  onClick={() => setSelectedBoost(boost)}
                  className={`flex-1 border px-2 py-1.5 text-[10px] transition-colors ${
                    selectedBoost?.purchase_id === boost.purchase_id
                      ? "border-orange-400/60 bg-orange-500/10 text-orange-300"
                      : "border-cream/10 text-muted hover:border-cream/20"
                  }`}
                >
                  {boost.name}
                  <br />
                  <span className="text-orange-400">+{boost.bonus}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="mb-3 text-center text-[10px] text-red-400">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="btn-press flex-1 border-[2px] border-cream/20 px-3 py-2 text-xs text-muted transition-colors hover:border-cream/40 hover:text-cream"
          >
            Cancel | 取消
          </button>
          <button
            onClick={() => onRaid(selectedBoost?.purchase_id, selectedVehicle)}
            disabled={loading}
            className="btn-press flex-1 border-[2px] border-red-500/60 px-3 py-2 text-xs font-bold text-red-400 transition-all hover:bg-red-500/10 disabled:opacity-50"
            style={{
              animation: loading ? "none" : "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          >
            {loading ? "RAIDING..." : "RAID"}
          </button>
        </div>
      </div>
    </div>
  );
}
