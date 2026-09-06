import { afterEach, describe, expect, it, vi } from "vitest";
import { pushSupported, subscribeToPush } from "./push-subscribe";

/**
 * 購読の手順は通知の設定と初回の告知の2箇所から呼ばれる（change 11）。
 * 端末の API は node に無いので、必要なものだけ立てて分岐を確かめる。
 *
 * **`./actions` は差し替える。** そこから辿ると `lib/db.ts` の `server-only` に
 * 当たり、node では import した時点で throw する（`react-server` 条件が無い
 * 環境では投げる側が解決される）。`vi.mock` は巻き上げられるので、本物の
 * モジュールは読み込まれない。
 */
const register = vi.fn(async () => ({ ok: true as const }));
vi.mock("./actions", () => ({ registerSubscription: () => register() }));

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
  register.mockClear();
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
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: async () => "default",
    });
    const result = await subscribeToPush("key");

    expect(result).toEqual({ ok: false, reason: "declined" });
    // 断られたのだから、保存にも行かない
    expect(register).not.toHaveBeenCalled();
  });
});
