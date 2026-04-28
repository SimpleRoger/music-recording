import { useState, useEffect } from "react";

const LOCK_FROM = "22:00"; // 10:00 PM — change only on request
const LOCK_UNTIL = "07:00"; // 7:00 AM — change only on request

function isLockActive(): boolean {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [fromH, fromM] = LOCK_FROM.split(":").map(Number);
  const [untilH, untilM] = LOCK_UNTIL.split(":").map(Number);
  const lockFrom = fromH * 60 + fromM;   // 1320 (10pm)
  const lockUntil = untilH * 60 + untilM; // 420  (7am)
  // Overnight window: locked if >= 10pm OR < 7am
  return mins >= lockFrom || mins < lockUntil;
}

export function useBedtime() {
  const [isLocked, setIsLocked] = useState(isLockActive);

  useEffect(() => {
    const id = setInterval(() => setIsLocked(isLockActive()), 30_000);
    return () => clearInterval(id);
  }, []);

  return { isLocked };
}
