/** `null` means an ordinary chat message; an empty string means a missing question. */
export function btwPrompt(text: string): string | null {
  const match = text.trim().match(/^\/btw(?:\s+([\s\S]*))?$/i);
  return match ? (match[1] ?? '').trim() : null;
}

export const parseBtw = btwPrompt;
export const parseBTW = btwPrompt;
export const BtwPrompt = btwPrompt;
