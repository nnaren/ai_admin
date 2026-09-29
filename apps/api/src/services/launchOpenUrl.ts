/**
 * Extract a one-shot browser launch URL (e.g. dsh web `?token=`) from process output.
 * Prefers loopback URLs when both local and LAN forms are printed.
 */
const TOKEN_URL_RE = /https?:\/\/[^\s"'<>]+[?&]token=[^\s"'<>]+/gi;

export function extractLaunchOpenUrl(output: string): string | undefined {
  const matches = output.match(TOKEN_URL_RE);
  if (!matches || matches.length === 0) return undefined;

  const cleaned = matches.map((raw) => raw.replace(/[),.;]+$/u, ''));
  const loopback = cleaned.find((url) => {
    try {
      const host = new URL(url).hostname;
      return host === '127.0.0.1' || host === 'localhost' || host === '::1';
    } catch {
      return false;
    }
  });
  return loopback ?? cleaned[cleaned.length - 1];
}
