// Converts a wall-clock reading ("2026-11-10 07:30 in Asia/Kolkata") to the real instant.

function offsetMs(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which the clock read `time` on `day` in `timeZone`. For a time skipped
 * by a daylight-saving change, the result lands just after the gap.
 */
export function zonedInstant(day: string, time: string, timeZone: string) {
  const naive = Date.parse(`${day}T${time.length === 5 ? `${time}:00` : time}Z`);
  let guess = naive - offsetMs(new Date(naive), timeZone);
  // A second pass settles readings near a daylight-saving change.
  guess = naive - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}
