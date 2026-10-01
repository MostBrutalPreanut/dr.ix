// PIN helpers
export const DEFAULT_PIN = '0000';

/** The PIN is a convenience gate between colleagues, not a security boundary. */
export async function hashPin(employeeId: string, pin: string): Promise<string> {
  const text = `${employeeId}:${pin}`;
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Insecure-context fallback (plain http on a local network)
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `x${(h >>> 0).toString(16)}`;
}

