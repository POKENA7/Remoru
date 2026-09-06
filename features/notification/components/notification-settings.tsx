"use client";

import { useState } from "react";
import { saveNotificationSettings, unregisterSubscription } from "../actions";
import { pushSupported, subscribeToPush } from "../push-subscribe";
import type { NotificationPayload } from "../types";

type Settings = { enabled: boolean; hour: number; timeZone: string };

/**
 * 通知の設定。**取得はしない**（design.md D8）。
 *
 * 設定は `/review` の Container が読み、props で届く。以前はここで開いてから
 * `/api/notifications/settings` を叩いており、開くたびに「読み込み中」が
 * 挟まっていた。
 *
 * 保存したあとの値はこの画面が持つ。`refresh()` で新しい props も届くが、
 * 往復を待たずに手応えを返すため。
 */
export function NotificationSettings({
  payload,
  onClose,
}: {
  /** サーバーが渡した設定。読めなかったときは null */
  payload: NotificationPayload | null;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(payload?.settings ?? null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const vapidPublicKey = payload?.vapidPublicKey ?? null;
  const selectableHours = payload?.selectableHours ?? [];

  async function save(next: Settings): Promise<boolean> {
    try {
      const result = await saveNotificationSettings(next);
      if (!result.ok) return false;
      setSettings(result.settings);
      return true;
    } catch {
      // action に辿り着けない失敗（圏外・配備後の古い識別子。design.md R2b）
      return false;
    }
  }

  /** 端末の許可を得て購読を保存する。実体は features/notification/push-subscribe.ts。 */
  async function subscribe(key: string): Promise<boolean> {
    const result = await subscribeToPush(key);
    if (result.ok) return true;
    setNotice(
      result.reason === "blocked"
        ? "この端末では通知が止められています。ブラウザの設定から変えられます"
        : result.reason === "declined"
          ? "通知はオフのままにします"
          : "保存できませんでした。もう一度試してください",
    );
    return false;
  }

  async function unsubscribe(): Promise<void> {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    // 先に保存先から消す。端末側だけ消すと、届かない購読が残り続ける。
    await unregisterSubscription(subscription.endpoint);
    await subscription.unsubscribe();
  }

  async function toggle(next: boolean) {
    if (!settings || busy) return;
    setBusy(true);
    setNotice(null);

    try {
      if (next) {
        if (!vapidPublicKey) {
          setNotice("この環境では通知を用意できていません");
          return;
        }
        if (!(await subscribe(vapidPublicKey))) return;

        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!(await save({ ...settings, enabled: true, timeZone }))) {
          setNotice("保存できませんでした。もう一度試してください");
        }
      } else {
        if (!(await save({ ...settings, enabled: false }))) {
          setNotice("保存できませんでした。もう一度試してください");
          return;
        }
        await unsubscribe();
      }
    } catch {
      setNotice("うまくいきませんでした。もう一度試してください");
    } finally {
      setBusy(false);
    }
  }

  async function changeHour(hour: number) {
    if (!settings || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (!(await save({ ...settings, hour }))) {
        setNotice("保存できませんでした。もう一度試してください");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="review-head">
        <button type="button" className="quit back" aria-label="戻る" onClick={onClose}>
          ←
        </button>
        <span className="counter">通知</span>
      </div>

      {!pushSupported() && (
        <p className="muted">このブラウザでは通知を扱えません。復習はこのまま使えます。</p>
      )}

      {/* **「読み込み中」は無くなった。** 設定はサーバーが最初の描画で渡す */}
      {pushSupported() && settings && (
        <>
          <div className="setting-row">
            <div>
              <b>通知を受け取る</b>
              <p className="muted">
                {settings.enabled ? `毎日${settings.hour}時ごろ、その日の分だけ` : "オフ"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              aria-label="通知を受け取る"
              className="switch"
              disabled={busy}
              onClick={() => void toggle(!settings.enabled)}
            >
              <i />
            </button>
          </div>

          {settings.enabled && (
            <div className="setting-row">
              <div>
                <b>時刻</b>
                <p className="muted">{settings.timeZone} の時刻で送ります</p>
              </div>
              <select
                className="hour"
                value={settings.hour}
                disabled={busy}
                aria-label="通知の時刻"
                onChange={(e) => void changeHour(Number(e.target.value))}
              >
                {selectableHours.map((h) => (
                  <option key={h} value={h}>
                    {h}時
                  </option>
                ))}
              </select>
            </div>
          )}

          {notice && <p className="error">{notice}</p>}

          <p className="hint" style={{ marginTop: "1.4rem" }}>
            復習がある日だけ届きます
          </p>
          <p className="hint" style={{ marginTop: "0.5rem" }}>
            iPhone・iPad では、ホーム画面に追加したものからでないと通知が届きません。
          </p>
        </>
      )}
    </div>
  );
}
