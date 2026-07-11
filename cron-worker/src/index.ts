export interface Env {
  DB: D1Database;
  INTERNAL_API_URL: string;
  INTERNAL_SECRET: string;
}

type UserRow = {
  id: string;
  timezone: string;
  notification_hour: number;
};

type ReviewCardRow = {
  id: string;
};

export function getLocalHour(nowTs: number, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  });
  return parseInt(formatter.format(new Date(nowTs * 1000)), 10) % 24;
}

export async function runDigest(env: Env): Promise<void> {
  const nowTs = Math.floor(Date.now() / 1000);

  const { results: allUsers } = await env.DB.prepare(
    "SELECT id, timezone, notification_hour FROM users",
  ).all<UserRow>();

  for (const user of allUsers) {
    let localHour: number;
    try {
      localHour = getLocalHour(nowTs, user.timezone);
    } catch {
      continue;
    }

    if (localHour !== user.notification_hour) continue;

    const { results: dueCards } = await env.DB.prepare(
      "SELECT id FROM review_cards WHERE user_id = ? AND due_date <= ?",
    )
      .bind(user.id, nowTs)
      .all<ReviewCardRow>();

    if (dueCards.length === 0) continue;

    try {
      await fetch(`${env.INTERNAL_API_URL}/api/internal/send-push`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": env.INTERNAL_SECRET,
        },
        body: JSON.stringify({ userId: user.id, dueCount: dueCards.length }),
      });
    } catch {
      // A network error (or the remote worker being briefly unavailable) for
      // one user must not abort the digest run for every subsequent user.
      continue;
    }
  }
}

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runDigest(env));
  },
};
