import { describe, it, expect, afterEach, vi } from "vitest";
import { pushSupported, subscribeToPush } from "./push-subscribe";

/**
 * 購読の手順は通知の設定と初回の告知の2箇所から呼ばれる（change 11）。
 * 端末の API は node に無いので、必要なものだけ立てて分岐を確かめる。
 */

// navigator は node では getter のみなので、代入ではなく stubGlobal で差し替える
function setupWindow(opts: { pushManager?: boolean; notification?: boolean } = {}) {
  const win: Record<string, unknown> = {};
  if (opts.pushManager !== false) win.PushManager = class {};
  if (opts.notification !== false) win.Notification = class {};
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", { serviceWorker: {} });
  if (opts.notification !== false) {
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn() });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("端末が通知を扱えるか", () => {
  it("揃っていれば扱える", () => {
    setupWindow();
    expect(pushSupported()).toBe(true);
  });

  it("PushManager が無ければ扱えない", () => {
    setupWindow({ pushManager: false });
    expect(pushSupported()).toBe(false);
  });

  it("Notification が無ければ扱えない", () => {
    setupWindow({ notification: false });
    expect(pushSupported()).toBe(false);
  });
});

describe("購読", () => {
  it("端末で止められていれば求め直さない", async () => {
    setupWindow();
    const ask = vi.fn();
    vi.stubGlobal("Notification", { permission: "denied", requestPermission: ask });

    const result = await subscribeToPush("key");

    expect(result).toEqual({ ok: false, reason: "blocked" });
    // 断った人に繰り返し求めない（notification spec）
    expect(ask).not.toHaveBeenCalled();
  });

  it("その場で断られたら購読しない", async () => {
    setupWindow();
    vi.stubGlobal("Notification", { permission: "default", requestPermission: async () => "default" });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await subscribeToPush("key");

    expect(result).toEqual({ ok: false, reason: "declined" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
