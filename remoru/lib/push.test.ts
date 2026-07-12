import { describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

import webPush from "web-push";
import { sendWebPush } from "./push";

const vapid = {
  publicKey: "pub",
  privateKey: "priv",
  subject: "mailto:test@example.com",
};

const subscription = {
  endpoint: "https://push.example/abc",
  keysP256dh: "p1",
  keysAuth: "a1",
};

describe("sendWebPush", () => {
  it("sends the notification with VAPID details configured", async () => {
    (webPush.sendNotification as any).mockResolvedValueOnce(undefined);

    const result = await sendWebPush(
      subscription,
      { title: "t", body: "b", url: "/review" },
      vapid,
    );

    expect(webPush.setVapidDetails).toHaveBeenCalledWith(
      "mailto:test@example.com",
      "pub",
      "priv",
    );
    expect(webPush.sendNotification).toHaveBeenCalledWith(
      { endpoint: subscription.endpoint, keys: { p256dh: "p1", auth: "a1" } },
      JSON.stringify({ title: "t", body: "b", url: "/review" }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("reports expired when the push service returns 410", async () => {
    (webPush.sendNotification as any).mockRejectedValueOnce({ statusCode: 410 });

    const result = await sendWebPush(
      subscription,
      { title: "t", body: "b", url: "/review" },
      vapid,
    );

    expect(result).toEqual({ ok: false, expired: true });
  });

  it("re-throws unexpected errors", async () => {
    (webPush.sendNotification as any).mockRejectedValueOnce({ statusCode: 500 });

    await expect(
      sendWebPush(subscription, { title: "t", body: "b", url: "/review" }, vapid),
    ).rejects.toBeTruthy();
  });
});
