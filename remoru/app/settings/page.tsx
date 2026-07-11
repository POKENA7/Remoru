"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [notificationHour, setNotificationHour] = useState(8);
  const [timezone, setTimezone] = useState("UTC");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json() as Promise<{ notificationHour: number; timezone: string }>)
      .then((data) => {
        setNotificationHour(data.notificationHour);
        setTimezone(data.timezone);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notificationHour, timezone }),
    });
    setSaved(true);
  }

  return (
    <main>
      <h1>通知設定</h1>
      <form onSubmit={handleSubmit}>
        <label>
          通知時刻(0-23時):
          <input
            type="number"
            min={0}
            max={23}
            value={notificationHour}
            onChange={(e) => setNotificationHour(Number(e.target.value))}
          />
        </label>
        <label>
          タイムゾーン:
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Asia/Tokyo"
          />
        </label>
        <button type="submit">保存</button>
      </form>
      {saved && <p>保存しました</p>}
    </main>
  );
}
