/**
 * Format a duration in milliseconds to a human-readable string
 * @param ms Duration in milliseconds
 * @returns Human-readable duration string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (remainingHours > 0) {
    return `${days}d ${remainingHours}h`;
  }
  return `${days}d`;
}

/**
 * Format a user identity (could be IP, username, etc.)
 * @param identity The identity string
 * @returns Object with display text and type
 */
export function formatUserIdentity(identity: string): {
  display: string;
  type: "ip" | "user" | "system";
} {
  // Check if it's an IP address (simple regex for IPv4)
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([\da-f]{1,4}:){7}[\da-f]{1,4}$/i;

  if (ipv4Regex.test(identity) || ipv6Regex.test(identity)) {
    return { display: identity, type: "ip" };
  }

  // Check if it's a system identity
  if (
    identity.toLowerCase() === "system" ||
    identity.toLowerCase() === "timeout"
  ) {
    return { display: identity, type: "system" };
  }

  // Otherwise treat as username
  return { display: identity, type: "user" };
}
