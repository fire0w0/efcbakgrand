import { useEffect, useState, type MouseEvent } from 'react';

// Dashboard-local navigation between /grandma and /grandma/:id. The shared mount in
// src/main.tsx already renders DashboardApp for both paths; we only read location.pathname.
export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  return path;
}

/** Internal links keep the current query string so the opt-in ?mock=1 flag survives navigation. */
export function href(path: string): string { return `${path}${window.location.search}`; }

export function navigate(event: MouseEvent<HTMLAnchorElement>, path: string): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.pushState(null, '', href(path));
  window.dispatchEvent(new PopStateEvent('popstate'));
}
