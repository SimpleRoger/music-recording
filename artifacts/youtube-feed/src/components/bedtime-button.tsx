import { useState, useRef, useEffect } from "react";
import { Moon, X, Lock } from "lucide-react";
import { useBedtime } from "../hooks/use-bedtime";

export function BedtimeButton() {
  const { settings, isLocked, cutoffLabel, update } = useBedtime();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Bedtime mode"
        className={`h-9 w-9 flex items-center justify-center rounded-xl transition-colors ${
          isLocked
            ? "text-indigo-300 bg-indigo-500/20 hover:bg-indigo-500/30"
            : settings.enabled
            ? "text-indigo-400 bg-indigo-500/15 hover:bg-indigo-500/25"
            : "text-text-muted hover:text-text-main hover:bg-surface-hover"
        }`}
      >
        <Moon className="w-4.5 h-4.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-64 bg-surface border border-border rounded-xl shadow-xl z-50 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text-main flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              Bedtime Mode
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-text-muted hover:text-text-main transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {isLocked ? (
            /* ── Locked state — no controls, just info ── */
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                <Lock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <p className="text-xs text-indigo-300 leading-snug">
                  It's past {cutoffLabel}. Settings are locked — go to sleep!
                </p>
              </div>
              <p className="text-xs text-text-muted text-center">
                You can adjust your bedtime tomorrow.
              </p>
            </div>
          ) : (
            /* ── Normal state — full settings ── */
            <>
              <p className="text-xs text-text-muted leading-relaxed">
                Blocks new searches after your cutoff time so you don't stay up late scrolling.
              </p>

              {/* Enable toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-text-main">Enabled</span>
                <button
                  onClick={() => update({ enabled: !settings.enabled })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    settings.enabled ? "bg-indigo-500" : "bg-surface-hover"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      settings.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>

              {/* Time picker */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-muted">Lock searches after</span>
                <input
                  type="time"
                  value={settings.cutoff}
                  onChange={(e) => update({ cutoff: e.target.value })}
                  className="h-9 px-3 bg-background border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </label>

              {settings.enabled && (
                <p className="text-xs text-indigo-400 font-medium text-center">
                  Searches lock at {cutoffLabel}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
