/**
 * 「いま、この利用者へ送るべきか」の判定。
 *
 * cron の中心。ここが間違うと「通知が来ない」「二重に来る」という、
 * どちらも気づきにくい壊れ方をする。
 *
 * このモジュールは D1・HTTP・フレームワークのいずれも import しない。
 * 現在時刻は引数で受け取り、内部で時計を読まない（design.md D3・D4）。
 */

export type NotificationTarget = {
  userId: string;
  enabled: boolean;
  /** 通知する時刻（0-23）。利用者の地域での時刻。 */
  hour: number;
  /** IANA のタイムゾーン名。 */
  timeZone: string;
  /** 最後に送った日（利用者の地域での YYYY-MM-DD）。未送信なら null。 */
  lastSentOn: string | null;
};

export type SkipReason = "disabled" | "different_hour" | "already_sent_today" | "invalid_time_zone";

export type Decision = { send: true; localDate: string } | { send: false; reason: SkipReason };

/**
 * ある瞬間における、その地域での「時」と「日付」を返す。
 *
 * 不正なタイムゾーン名は null を返す。呼び出し側はその利用者だけを
 * 飛ばし、他の利用者への配信を止めないこと（spec の要件）。
 */
export function localHourAndDate(
  now: number,
  timeZone: string,
): { hour: number; date: string } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(now));

    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const year = get("year");
    const month = get("month");
    const day = get("day");
    const hour = get("hour");
    if (!year || !month || !day || hour === undefined) return null;

    return { hour: Number(hour), date: `${year}-${month}-${day}` };
  } catch {
    // 不正な IANA 名は RangeError になる
    return null;
  }
}

/** その利用者へ、いま送るべきか。 */
export function shouldNotify(target: NotificationTarget, now: number): Decision {
  if (!target.enabled) return { send: false, reason: "disabled" };

  const local = localHourAndDate(now, target.timeZone);
  if (!local) return { send: false, reason: "invalid_time_zone" };

  if (local.hour !== target.hour) {
    return { send: false, reason: "different_hour" };
  }

  // cron は毎時起きるうえ、稀に二重に起動しうる。時刻の一致だけでは
  // 防げないので、送った日の記録で弾く（design.md D4）。
  if (target.lastSentOn === local.date) {
    return { send: false, reason: "already_sent_today" };
  }

  return { send: true, localDate: local.date };
}

/** 送るべき利用者だけを選ぶ。壊れた設定の1人が全体を止めないこと。 */
export function selectTargets(
  targets: NotificationTarget[],
  now: number,
): { userId: string; localDate: string }[] {
  const selected: { userId: string; localDate: string }[] = [];
  for (const target of targets) {
    const decision = shouldNotify(target, now);
    if (decision.send) {
      selected.push({ userId: target.userId, localDate: decision.localDate });
    }
  }
  return selected;
}
