"use client";

import { useCallback, useEffect, useState } from "react";
import { pushSupported, subscribeToPush } from "./push-subscribe";

type Settings = { enabled: boolean; hour: number; timeZone: string };

type Payload = {
  settings: Settings;
  selectableHours: number[];
  vapidPublicKey: string | null;
};

export function NotificationSettings({ onClose }: { onClose: () => void }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/settings");
      if (res.ok) setPayload((await res.json()) as Payload);
    } catch {
      // 読めなかったときは何も出さない。設定は次に開いたときに読み直す。
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: Settings): Promise<boolean> {
    const res = await fetch("/api/notifications/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) return false;
    setPayload((p) => (p ? { ...p, settings: next } : p));
    return true;
  }

  /** 端末の許可を得て購読を保存する。実体は app/push-subscribe.ts。 */
  async function subscribe(vapidPublicKey: string): Promise<boolean> {
    const result = await subscribeToPush(vapidPublicKey);
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
    await fetch("/api/notifications/subscription", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  }

  async function toggle(next: boolean) {
    if (!payload || busy) return;
    setBusy(true);
    setNotice(null);

    try {
      if (next) {
        if (!payload.vapidPublicKey) {
          setNotice("この環境では通知を用意できていません");
          return;
        }
        if (!(await subscribe(payload.vapidPublicKey))) return;

        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!(await save({ ...payload.settings, enabled: true, timeZone }))) {
          setNotice("保存できませんでした。もう一度試してください");
        }
      } else {
        if (!(await save({ ...payload.settings, enabled: false }))) {
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
    if (!payload || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (!(await save({ ...payload.settings, hour }))) {
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

      {loading && <p className="muted">読み込み中...</p>}

      {!loading && !pushSupported() && (
        <p className="muted">このブラウザでは通知を扱えません。復習はこのまま使えます。</p>
      )}

      {!loading && pushSupported() && payload && (
        <>
          <div className="setting-row">
            <div>
              <b>通知を受け取る</b>
              <p className="muted">
                {payload.settings.enabled
                  ? `毎日${payload.settings.hour}時ごろ、その日の分だけ`
                  : "オフ"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={payload.settings.enabled}
              aria-label="通知を受け取る"
              className="switch"
              disabled={busy}
              onClick={() => void toggle(!payload.settings.enabled)}
            >
              <i />
            </button>
          </div>

          {payload.settings.enabled && (
            <div className="setting-row">
              <div>
                <b>時刻</b>
                <p className="muted">{payload.settings.timeZone} の時刻で送ります</p>
              </div>
              <select
                className="hour"
                value={payload.settings.hour}
                disabled={busy}
                aria-label="通知の時刻"
                onChange={(e) => void changeHour(Number(e.target.value))}
              >
                {payload.selectableHours.map((h) => (
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
