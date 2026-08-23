import { describe, it, expect, vi } from "vitest";
import { classifyResponse, deliver, type Subscription, type SendOutcome } from "./push";
import { buildNotification } from "./notification-message";

const sub = (id: string): Subscription => ({
  id, endpoint: `https://push.example/${id}`, p256dh: "key", auth: "auth",
});

describe("応答の分類（タスク 3.1）", () => {
  // レビュー指摘: この分類は cron-worker/src/send.ts にあり、どのテストからも
  // 実行されていなかった。偽の send を渡すテストは deliver の集計しか見て
  // いないため、410 を落とすような誤りを検出できなかった。
  it("410 と 404 は期限切れ", () => {
    expect(classifyResponse(410)).toBe("expired");
    expect(classifyResponse(404)).toBe("expired");
  });

  it("2xx は成功", () => {
    for (const s of [200, 201, 202, 204]) expect(classifyResponse(s)).toBe("sent");
  });

  it("その他の失敗は期限切れに含めない（購読を消さない）", () => {
    for (const s of [400, 401, 403, 429, 500, 502, 503]) {
      expect(classifyResponse(s)).toBe("failed");
    }
  });

  it("403 を期限切れに含めない", () => {
    // VAPID の設定ミスは 403 になる。これで購読を消すと、鍵を直しても
    // 二度と届かなくなる
    expect(classifyResponse(403)).not.toBe("expired");
  });
});

describe("配信（タスク 3.1）", () => {
  it("成功を数える", async () => {
    const send = vi.fn(async (): Promise<SendOutcome> => "sent");

    const r = await deliver([sub("a"), sub("b")], "{}", send);

    expect(r).toEqual({ sent: 2, expired: [], failed: 0 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("期限切れを分けて返す（タスク 3.2）", async () => {
    const send = async (s: Subscription): Promise<SendOutcome> =>
      s.id === "gone" ? "expired" : "sent";

    const r = await deliver([sub("ok"), sub("gone")], "{}", send);

    expect(r.sent).toBe(1);
    expect(r.expired).toEqual(["gone"]);
  });

  it("ネットワークに出ない", async () => {
    // fetch を呼んだら落とす
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("ネットワークに出た");
    });
    const send = async (): Promise<SendOutcome> => "sent";

    await deliver([sub("a")], "{}", send);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("一部が失敗しても他を続ける（タスク 3.3）", () => {
  it("真ん中が失敗しても両端へ送る", async () => {
    const attempted: string[] = [];
    const send = async (s: Subscription): Promise<SendOutcome> => {
      attempted.push(s.id);
      return s.id === "b" ? "failed" : "sent";
    };

    const r = await deliver([sub("a"), sub("b"), sub("c")], "{}", send);

    expect(attempted).toEqual(["a", "b", "c"]);
    expect(r).toEqual({ sent: 2, expired: [], failed: 1 });
  });

  it("送信が例外を投げても残りを続ける", async () => {
    const attempted: string[] = [];
    const send = async (s: Subscription): Promise<SendOutcome> => {
      attempted.push(s.id);
      if (s.id === "boom") throw new Error("予期しない失敗");
      return "sent";
    };

    const r = await deliver([sub("a"), sub("boom"), sub("c")], "{}", send);

    expect(attempted).toEqual(["a", "boom", "c"]);
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
  });
});

describe("通知の中身（タスク 3.5・design.md D5）", () => {
  it("件数と先頭の問いを含む", () => {
    const n = buildNotification(3, { question: "近所のパン屋の定休日は？" });

    expect(n.title).toContain("3");
    expect(n.body).toBe("近所のパン屋の定休日は？");
  });

  it("1件のときも問いを含む", () => {
    const n = buildNotification(1, { question: "山田さんの誕生日は？" });
    expect(n.title).toContain("1");
    expect(n.body).toBe("山田さんの誕生日は？");
  });

  it("答えとメモ本文は入り込みようがない（引数に取らない）", () => {
    // buildNotification は question しか受け取らない。答えやメモ本文を
    // 渡す口が無いこと自体が、漏れないことの担保になっている。
    const n = buildNotification(2, { question: "醤油はどこで保存する？" });
    const all = `${n.title} ${n.body}`;

    expect(all).not.toContain("冷蔵庫");                       // 答え
    expect(all).not.toContain("醤油は冷蔵庫で保存したほうが"); // メモ本文
  });

  it("長い問いは切り詰める", () => {
    const long = "あ".repeat(200);
    const n = buildNotification(1, { question: long });

    expect([...n.body].length).toBeLessThanOrEqual(61); // 60 + 省略記号
    expect(n.body.endsWith("…")).toBe(true);
  });

  it("タップ先が復習タブを指す", () => {
    // レビュー指摘: "/" ではメモタブが開く。通知から復習へ入れることが
    // spec の要件なので、タブを指定する
    const url = buildNotification(1, { question: "問" }).url;
    expect(url).toContain("tab=review");
  });
});
