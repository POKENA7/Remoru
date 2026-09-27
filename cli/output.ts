import type { AddResult, ApiMemo, ApiMemoDetail, ApiTag, TokenCheckReason } from "./api.ts";

/**
 * 人のための表示。**純関数だけを置く。** 通信も端末も触らない。
 *
 * 中身の語はAPIが返す機械語なので、ここで日本語にする。対応表は総当たりに
 * せず、知らない語はそのまま出す。APIが語を増やしたときに、CLIを直すまで
 * 何も出ない、という状態にしないためである。
 */
const REASON_LABELS: Record<string, string> = {
  empty: "本文が空です",
  too_long: "本文が長すぎます",
  failed: "保存できませんでした",
  invalid_body: "要求の形が違います",
  too_many: "一度に送れる件数を超えています",
  invalid_limit: "limit の値が違います",
  invalid_tag: "tag の値が違います",
  unauthorized: "トークンが違うか、失効しています",
  rate_limited: "回数が多すぎます。少し待ってください",
  http_400: "要求の形が違います",
  http_401: "トークンが違うか、失効しています",
  http_404: "見つかりません",
  http_429: "回数が多すぎます。少し待ってください",
  invalid_response: "サーバーの応答を読めませんでした",
};

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

export function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
}

/**
 * 再開できる時刻（design D8）。実行環境のローカル時刻で示す。
 *
 * 入力はエポックミリ秒。呼び出し側が「受け取った時刻 + retry-after 秒」を
 * 渡す。**テストは `TZ` に依存しない形で書く**——文字列そのものを固めず、
 * 同じ関数で組み立てた値と突き合わせる（L07）。
 */
export function formatResumeAt(ms: number): string {
  return new Date(ms).toLocaleString("ja-JP", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * login が失敗した理由を人に分かる文にする（design D7）。
 *
 * 401 はトークンそのものの問題、通信の失敗はあて先の問題である。混ぜると、
 * 直す先を取り違える。
 */
export function loginFailureMessage(reason: TokenCheckReason, baseUrl: string): string {
  switch (reason) {
    case "unauthorized":
      return "トークンが違うか、失効しています";
    case "unreachable":
      return `つながらなかった: ${baseUrl}`;
    case "failed":
      return "トークンを確かめられませんでした";
  }
}

/** 一覧で1行に収める。長い本文は切る。 */
export function oneLine(text: string, max = 60): string {
  const first = text.split("\n")[0].trim();
  return [...first].length > max ? `${[...first].slice(0, max).join("")}…` : first;
}

export function reviewLabel(review: ApiMemo["review"]): string {
  switch (review.kind) {
    case "scheduled":
      return `次は ${formatDay(review.nextReviewAt)}`;
    case "generating":
      return "問と答をつくっています";
    case "unwritten":
      return "問と答が未作成";
  }
}

export function formatMemo(memo: ApiMemo): string[] {
  const tags = memo.tags.length > 0 ? memo.tags.map((t) => t.name).join(", ") : "タグなし";
  return [
    `- ${oneLine(memo.content)}`,
    `  id: ${memo.id}`,
    `  タグ: ${tags}  ${reviewLabel(memo.review)}`,
  ];
}

export function formatMemoDetail(memo: ApiMemoDetail): string[] {
  const lines = [memo.content, "", `id: ${memo.id}`];
  lines.push(
    `タグ: ${memo.tags.length > 0 ? memo.tags.map((t) => t.name).join(", ") : "タグなし"}`,
  );

  if (memo.review.kind === "scheduled") {
    lines.push(`次は ${formatDay(memo.review.nextReviewAt)}`);
    lines.push(`問: ${memo.review.question}`);
    lines.push(`答: ${memo.answer ?? ""}`);
  } else if (memo.review.kind === "generating") {
    lines.push("問と答をつくっています");
  } else {
    lines.push("問と答は未作成");
  }

  return lines;
}

export function formatTag(tag: ApiTag): string {
  return `${tag.name}（${tag.count}件）  id: ${tag.id}`;
}

/**
 * `--dry-run` の表示。**送る本文をそのまま出す。**
 *
 * 切って示すと、利用者が確認したものと送るものが変わる。長くても出す。
 */
export function formatDryRun(contents: string[]): string[] {
  const lines = [`${contents.length}件を送ります（--dry-run）`];
  contents.forEach((content, index) => {
    lines.push(`--- ${index + 1} ---`);
    lines.push(content);
  });
  return lines;
}

export type AddReport = {
  /** 標準出力へ出す行。 */
  lines: string[];
  /** 標準エラーへ出す行。 */
  errors: string[];
  exitCode: number;
};

/**
 * 登録の結果を人の読む形にする。
 *
 * **途中で失敗しても、それまでに登録できた件は必ず示す。** 黙って終わると、
 * 利用者はどこまで入ったか分からず、同じ内容を送り直して重複させる。
 *
 * 429（1日の上限）のときは、**送れた件と送れなかった件を分けて**示し、
 * 残りの件数と再開できる時刻を添える（design D8）。`resumeAt` は呼び出し側が
 * 「受け取った時刻 + retry-after 秒」で渡す。無ければ時刻は出さない。
 */
export function reportAdd(
  contents: string[],
  result: AddResult,
  options: { resumeAt?: number } = {},
): AddReport {
  const items: string[] = [];
  const errors: string[] = [];
  let accepted = 0;
  let failed = 0;

  contents.forEach((content, index) => {
    const item = result.results[index];
    if (item === undefined) return;
    if (item.ok) {
      accepted += 1;
      items.push(`+ ${oneLine(content)}`);
    } else {
      failed += 1;
      errors.push(`- ${oneLine(content)}（${reasonLabel(item.reason)}）`);
    }
  });

  const lines: string[] = [];
  if (result.ok) {
    if (failed === 0) {
      lines.push(`${accepted}件を登録しました`);
    } else {
      lines.push(`${accepted}件を登録しました。${failed}件は保存できませんでした`);
    }
  } else if (result.error === "rate_limited") {
    // 結果が返らなかった件＝429 のバッチとそれ以降。送れた件と分けて示す
    const notSent = contents.length - result.results.length;
    lines.push(
      `${accepted}件を登録しました。${notSent}件は送れませんでした（1日の上限に達しました）`,
    );
    if (result.remaining !== undefined) {
      lines.push(`この日にあと ${result.remaining} 件送れます`);
    }
    if (options.resumeAt !== undefined) {
      lines.push(`再開できるのは ${formatResumeAt(options.resumeAt)} ごろです`);
    }
  } else {
    errors.unshift(`途中で失敗しました（${accepted}件は登録済み）: ${reasonLabel(result.error)}`);
  }
  lines.push(...items);

  return { lines, errors, exitCode: !result.ok || failed > 0 ? 1 : 0 };
}
