import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "tubefeed-bedtime";

interface BedtimeSettings {
  enabled: boolean;
  cutoff: string; // "HH:MM" 24h format
}

const DEFAULT: BedtimeSettings = { enabled: false, cutoff: "22:00" };

function load(): BedtimeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT;
}

function save(s: BedtimeSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function isPastCutoff(cutoff: string): boolean {
  const now = new Date();
  const [hh, mm] = cutoff.split(":").map(Number);
  const cutoffMinutes = hh * 60 + mm;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= cutoffMinutes;
}

export function useBedtime() {
  const [settings, setSettings] = useState<BedtimeSettings>(load);
  const [isLocked, setIsLocked] = useState(() =>
    settings.enabled && isPastCutoff(settings.cutoff)
  );

  // Re-check every 30 seconds
  useEffect(() => {
    const check = () => {
      const s = load();
      setIsLocked(s.enabled && isPastCutoff(s.cutoff));
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  const update = useCallback((patch: Partial<BedtimeSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      setIsLocked(next.enabled && isPastCutoff(next.cutoff));
      return next;
    });
  }, []);

  // Format cutoff for display: "22:00" → "10:00 PM"
  const cutoffLabel = (() => {
    const [hh, mm] = settings.cutoff.split(":").map(Number);
    const ampm = hh >= 12 ? "PM" : "AM";
    const h = hh % 12 || 12;
    return `${h}:${mm.toString().padStart(2, "0")} ${ampm}`;
  })();

  return { settings, isLocked, cutoffLabel, update };
}
