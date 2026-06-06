import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "tubefeed-listened-beats";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function save(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // ignore quota errors
  }
}

let globalListened: Set<string> = load();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function markListened(videoId: string) {
  if (!globalListened.has(videoId)) {
    globalListened = new Set(globalListened).add(videoId);
    save(globalListened);
    notify();
  }
}

export function useListenedBeats() {
  const [listened, setListened] = useState<Set<string>>(globalListened);

  useEffect(() => {
    const fn = () => setListened(new Set(globalListened));
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const mark = useCallback((videoId: string) => {
    markListened(videoId);
  }, []);

  const isListened = useCallback((videoId: string) => listened.has(videoId), [listened]);

  return { listened, mark, isListened };
}
