const STARTUP_STATE_KEY = "brick-beats-startup-state-v1";

export function saveStartupState(startupState) {
  window.sessionStorage.setItem(STARTUP_STATE_KEY, JSON.stringify(startupState));
}

export function loadStartupState() {
  const raw = window.sessionStorage.getItem(STARTUP_STATE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearStartupState() {
  window.sessionStorage.removeItem(STARTUP_STATE_KEY);
}
