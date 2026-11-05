// A choice kept in this browser. Storage can be blocked, and then a choice lasts until the page is reloaded.
// The boxes are kept by model/storage.ts, since the model knows nothing of the screen.

// What is stored under the key, or null when nothing is or storage is blocked.
export function readChoice(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked, so it is kept on screen only.
  }
}
