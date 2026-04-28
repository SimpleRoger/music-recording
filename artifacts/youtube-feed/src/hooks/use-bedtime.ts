import { useState, useEffect } from "react";

const CUTOFF = "22:00"; // 10:00 PM — change only on request

function isPastCutoff(): boolean {
  const now = new Date();
  const [hh, mm] = CUTOFF.split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() >= hh * 60 + mm;
}

export function useBedtime() {
  const [isLocked, setIsLocked] = useState(isPastCutoff);

  useEffect(() => {
    const id = setInterval(() => setIsLocked(isPastCutoff()), 30_000);
    return () => clearInterval(id);
  }, []);

  return { isLocked };
}
