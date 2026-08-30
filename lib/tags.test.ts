import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { memos, memoTags, tags } from "../db/schema";
import { createMemo } from "./memos";
import {
  getTagsForMemos,
  listTagsWithCounts,
  MAX_TAG_NAME_LENGTH,
  MAX_TAGS_PER_MEMO,
  removeTag,
  setTag,
  validateTagName,
} from "./tags";
import { createTestDb } from "./test-db";

const NOW = Date.UTC(2026, 7, 25, 3, 0, 0);

async function seedMemo(db: ReturnType<typeof createTestDb>, content = "メモ", userId = "u1") {
  const created = await createMemo(db, { content, now: NOW, userId });
  if (!created.ok) throw new Error("メモを作れなかった");
  return created.memo.id;
}

async function tagNamesOf(db: ReturnType<typeof createTestDb>, memoId: string, userId = "u1") {
  return ((await getTagsForMemos(db, userId)).get(memoId) ?? []).map((t) => t.name);
}

describe("タグ名の検証", () => {
  it("空と空白だけを拒否する", () => {
    expect(validateTagName("")).toEqual({ ok: false, error: "empty_name" });
    expect(validateTagName("   ")).toEqual({ ok: false, error: "empty_name" });
  });

  it("前後の空白を落とす", () => {
    // 落とさないと「 仕事」と「仕事」が別のタグになり、絞り込みが分裂する
    expect(validateTagName("  仕事 ")).toEqual({ ok: true, name: "仕事" });
  });

  it("長すぎる名前を拒否する", () => {
    expect(validateTagName("あ".repeat(MAX_TAG_NAME_LENGTH + 1))).toEqual({
      ok: false,
      error: "too_long",
    });
  });
});

describe("タグの付与", () => {
  it("タグを付けられる", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);

    const result = await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW });

    expect(result.ok).toBe(true);
    expect(await tagNamesOf(db, memoId)).toEqual(["仕事"]);
  });

  it("同じタグを重ねて付けても1つのまま", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);

    await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW });
    await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW + 1000 });

    expect(await tagNamesOf(db, memoId)).toEqual(["仕事"]);
  });

  it("前後に空白のある名前は既存のタグと同じものとして扱う", async () => {
    const db = createTestDb();
    const a = await seedMemo(db, "A");
    const b = await seedMemo(db, "B");

    await setTag(db, { memoId: a, userId: "u1", name: "仕事", now: NOW });
    await setTag(db, { memoId: b, userId: "u1", name: " 仕事 ", now: NOW + 1000 });

    expect(await db.select().from(tags).where(eq(tags.userId, "u1"))).toHaveLength(1);
  });

  it("別のタグを付けると差し替わる", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);

    await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW });
    const result = await setTag(db, { memoId, userId: "u1", name: "読書", now: NOW + 1000 });

    expect(await tagNamesOf(db, memoId)).toEqual(["読書"]);
    expect(result.ok && result.replaced.map((t) => t.name)).toEqual(["仕事"]);
  });

  it("差し替えても、外れたタグ自体は残る", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);

    await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW });
    await setTag(db, { memoId, userId: "u1", name: "読書", now: NOW + 1000 });

    const names = (await db.select().from(tags).where(eq(tags.userId, "u1"))).map((t) => t.name);
    expect(names.sort()).toEqual(["仕事", "読書"]);
  });

  it("空の名前では付けられない", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);

    expect(await setTag(db, { memoId, userId: "u1", name: "  ", now: NOW })).toEqual({
      ok: false,
      error: "empty_name",
    });
    expect(await tagNamesOf(db, memoId)).toEqual([]);
  });
});

describe("タグの取り外し", () => {
  it("外すと紐づけだけが消え、タグは残る", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);
    const set = await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW });
    if (!set.ok) throw new Error("付けられなかった");

    expect(await removeTag(db, { memoId, userId: "u1", tagId: set.tag.id })).toBe(true);
    expect(await tagNamesOf(db, memoId)).toEqual([]);
    expect(await db.select().from(tags)).toHaveLength(1);
  });
});

describe("上限は1箇所で決まっている", () => {
  it("いまの上限は1", () => {
    expect(MAX_TAGS_PER_MEMO).toBe(1);
  });

  it("表は多対多のまま。1メモ1タグを主キーで固定していない", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);
    const now = NOW;

    // 上限を無視して**表に直接**2行入れられること。入らないなら、
    // 「1つ」が表の形で固定されており、緩めるのにマイグレーションが要る
    // （design.md D2）。
    await db.insert(tags).values([
      { id: "t1", userId: "u1", name: "仕事", createdAt: now },
      { id: "t2", userId: "u1", name: "読書", createdAt: now },
    ]);
    await db.insert(memoTags).values([
      { memoId, tagId: "t1", createdAt: now },
      { memoId, tagId: "t2", createdAt: now + 1 },
    ]);

    expect((await tagNamesOf(db, memoId)).sort()).toEqual(["仕事", "読書"]);
  });
});

describe("タグの分離", () => {
  it("他人のメモにはタグを付けられない", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db, "A", "u1");

    expect(await setTag(db, { memoId, userId: "u2", name: "仕事", now: NOW })).toEqual({
      ok: false,
      error: "memo_not_found",
    });
    expect(await tagNamesOf(db, memoId)).toEqual([]);
  });

  it("他人のメモのタグは外せない", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db, "A", "u1");
    const set = await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW });
    if (!set.ok) throw new Error("付けられなかった");

    expect(await removeTag(db, { memoId, userId: "u2", tagId: set.tag.id })).toBe(false);
    expect(await tagNamesOf(db, memoId)).toEqual(["仕事"]);
  });

  it("同じ名前でも利用者ごとに別のタグになる", async () => {
    const db = createTestDb();
    const a = await seedMemo(db, "A", "u1");
    const b = await seedMemo(db, "B", "u2");

    await setTag(db, { memoId: a, userId: "u1", name: "仕事", now: NOW });
    await setTag(db, { memoId: b, userId: "u2", name: "仕事", now: NOW });

    expect(await db.select().from(tags)).toHaveLength(2);
    expect((await getTagsForMemos(db, "u1")).has(b)).toBe(false);
    expect((await getTagsForMemos(db, "u2")).has(a)).toBe(false);
  });

  it("タグの一覧は自分のものだけを、自分のメモの件数で返す", async () => {
    const db = createTestDb();
    const a = await seedMemo(db, "A", "u1");
    const b = await seedMemo(db, "B", "u2");
    await setTag(db, { memoId: a, userId: "u1", name: "仕事", now: NOW });
    await setTag(db, { memoId: b, userId: "u2", name: "仕事", now: NOW });

    expect(await listTagsWithCounts(db, "u1")).toEqual([
      { id: expect.any(String), name: "仕事", count: 1 },
    ]);
  });
});

describe("メモの削除", () => {
  it("メモを消すと紐づけも消え、タグ自体は残る", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);
    await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW });

    await db.delete(memos).where(eq(memos.id, memoId));

    expect(await db.select().from(memoTags)).toHaveLength(0);
    // 使われなくなっても消さない。付け直せる状態に残す（spec の要件）
    expect(await db.select().from(tags)).toHaveLength(1);
  });
});

describe("上限を緩められること（design.md D2）", () => {
  it("上限を2にすると1件のメモが2つのタグを持てる", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);

    // スキーマにもマイグレーションにも触らず、上限の値だけを変えている。
    // 「拡張しやすくした」を主張で終わらせないための確認。
    await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW }, 2);
    await setTag(db, { memoId, userId: "u1", name: "読書", now: NOW + 1000 }, 2);

    expect((await tagNamesOf(db, memoId)).sort()).toEqual(["仕事", "読書"]);
  });

  it("上限を2にしても3つ目は古いものから落ちる", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);

    await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW }, 2);
    await setTag(db, { memoId, userId: "u1", name: "読書", now: NOW + 1000 }, 2);
    await setTag(db, { memoId, userId: "u1", name: "料理", now: NOW + 2000 }, 2);

    expect((await tagNamesOf(db, memoId)).sort()).toEqual(["料理", "読書"]);
  });

  it("既定では上限が効く（呼び出し側は渡さない）", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);

    await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW });
    await setTag(db, { memoId, userId: "u1", name: "読書", now: NOW + 1000 });

    expect(await tagNamesOf(db, memoId)).toHaveLength(MAX_TAGS_PER_MEMO);
  });
});

describe("タグでの絞り込み", () => {
  it("そのタグを持つメモだけを返す", async () => {
    const db = createTestDb();
    const work = await seedMemo(db, "会議は水曜");
    const book = await seedMemo(db, "積読が3冊");
    await seedMemo(db, "タグなし");

    const set = await setTag(db, { memoId: work, userId: "u1", name: "仕事", now: NOW });
    await setTag(db, { memoId: book, userId: "u1", name: "読書", now: NOW });
    if (!set.ok) throw new Error("付けられなかった");

    const { listMemos } = await import("./memos");
    const filtered = await listMemos(db, "u1", set.tag.id);
    expect(filtered.map((m) => m.content)).toEqual(["会議は水曜"]);

    // 絞り込まなければ全件
    expect(await listMemos(db, "u1")).toHaveLength(3);
  });

  it("他人のメモは絞り込みに混ざらない", async () => {
    const db = createTestDb();
    const mine = await seedMemo(db, "自分のメモ", "u1");
    const theirs = await seedMemo(db, "他人のメモ", "u2");

    const set = await setTag(db, { memoId: mine, userId: "u1", name: "仕事", now: NOW });
    if (!set.ok) throw new Error("付けられなかった");
    // 他人のメモに、こちらのタグの id を直接紐づけても見えないこと
    await db.insert(memoTags).values({ memoId: theirs, tagId: set.tag.id, createdAt: NOW });

    const { listMemos } = await import("./memos");
    const filtered = await listMemos(db, "u1", set.tag.id);
    expect(filtered.map((m) => m.content)).toEqual(["自分のメモ"]);
  });

  it("そのタグを持つメモが無ければ0件", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);
    const set = await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW });
    if (!set.ok) throw new Error("付けられなかった");
    await removeTag(db, { memoId, userId: "u1", tagId: set.tag.id });

    const { listMemos } = await import("./memos");
    expect(await listMemos(db, "u1", set.tag.id)).toEqual([]);
  });
});

describe("同じ時刻に2回付けても上限を超えない", () => {
  /**
   * 提案の受け入れは全件に**同じ now** を渡すので、memo_tags の createdAt が
   * 同値になる。並び替えの同点崩しが tagId になるため、落とす候補の選び方を
   * 誤ると「いま入れたタグ」が候補に入り、1件も落ちずに2つ残る。
   */
  it("createdAt が同値でも1つに収まる（tagId の並び順に依らない）", async () => {
    // どちらの並び順でも成立することを、名前を変えて何度も試す
    for (let i = 0; i < 40; i++) {
      const db = createTestDb();
      const memoId = await seedMemo(db, `メモ${i}`);

      await setTag(db, { memoId, userId: "u1", name: `A${i}`, now: NOW });
      await setTag(db, { memoId, userId: "u1", name: `B${i}`, now: NOW });

      const names = await tagNamesOf(db, memoId);
      expect(names).toHaveLength(MAX_TAGS_PER_MEMO);
      expect(names).toEqual([`B${i}`]);
    }
  });

  it("上限が2でも、同じ時刻の3回目で1つ落ちる", async () => {
    for (let i = 0; i < 20; i++) {
      const db = createTestDb();
      const memoId = await seedMemo(db, `メモ${i}`);

      await setTag(db, { memoId, userId: "u1", name: `A${i}`, now: NOW }, 2);
      await setTag(db, { memoId, userId: "u1", name: `B${i}`, now: NOW }, 2);
      await setTag(db, { memoId, userId: "u1", name: `C${i}`, now: NOW }, 2);

      expect(await tagNamesOf(db, memoId)).toHaveLength(2);
    }
  });
});
