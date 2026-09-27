#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { type ParsedCommand, parseArgs, splitMemos } from "./args.ts";
import { type Api, type AddResult, type ApiTag, createApi } from "./api.ts";
import { loginWithToken } from "./login.ts";
import {
  formatDryRun,
  formatMemo,
  formatMemoDetail,
  formatTag,
  loginFailureMessage,
  reasonLabel,
  reportAdd,
} from "./output.ts";
import { apiBaseUrl, clearToken, readToken } from "./store.ts";
import { defaultSkillDir, installSkill } from "./skill.ts";

/**
 * Remoru のコマンド。
 *
 * **運ぶだけである。** メモの切り分けはSKILLを読むAIが、本文の検証は
 * サーバーが担う（design D7・D8）。ここは要求を組み立て、結果を人に返す。
 *
 * 動かすには Node 22 以降が要る（型の除去をそのまま使う）。
 *
 *   node cli/remoru.ts memo add -f notes.md --dry-run
 */

const HELP = `Remoru のコマンド

  remoru login                    取り込みトークンを確かめてから保存する（標準入力から読む）
    --token <平文>                引数で渡す。シェルの履歴に残るので、普段は標準入力を使う
  remoru logout                   保存したトークンを消す

  remoru memo add [本文]          メモを登録する
    -f <ファイル>                 空行で区切った各ブロックを1メモとして登録する
    --dry-run                     送らずに、送る内容だけを示す
    --json                        結果をJSONで出す
  remoru memo list                メモを新しい順に出す
    --tag <名前またはid>          タグで絞り込む
    --limit <件数>                件数を絞る
    --json                        結果をJSONで出す
  remoru memo show <id>           1件の本文・タグ・問と答・次回出題日を出す
    --json                        結果をJSONで出す
  remoru tag list                 タグを出す
    --json                        結果をJSONで出す
  remoru skill install            調査するAIが読む手順の文書を置く
    --dir <置き場>                置き場（既定 ~/.claude/skills/remoru）

環境変数:
  REMORU_API_URL     あて先（既定 ${apiBaseUrl()}）
  REMORU_CONFIG_DIR  トークンの置き場（既定 ~/.config/remoru）
`;

async function main(argv: string[]): Promise<number> {
  const command = parseArgs(argv);

  switch (command.kind) {
    case "help":
      console.log(HELP);
      return 0;
    case "error":
      console.error(command.message);
      console.error("使い方は remoru help で見られます");
      return 2;
    case "login":
      return await login(command.token);
    case "logout":
      clearToken();
      console.log("トークンを消しました");
      return 0;
    case "memo-add":
      return await memoAdd(command);
    case "memo-list":
      return await memoList(command);
    case "memo-show":
      return await memoShow(command);
    case "tag-list":
      return await tagList(command.json);
    case "skill-install":
      return skillInstall(command.dir);
  }
}

/** 保存済みのトークンでクライアントを作る。無ければ案内して null。 */
function connect(): Api | null {
  const token = readToken();
  if (token === null) {
    console.error(
      "トークンがありません。アプリの設定「API トークン」で発行し、remoru login で保存してください",
    );
    return null;
  }
  return createApi({ baseUrl: apiBaseUrl(), token });
}

async function login(token: string | null): Promise<number> {
  let value = token;
  if (value === null) {
    if (process.stdin.isTTY) {
      console.error("トークンを貼り付けて、Ctrl-D を押してください");
    }
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    value = Buffer.concat(chunks).toString("utf8").trim();
  }

  if (value.length === 0) {
    console.error("トークンが空です");
    return 2;
  }

  // **保存の前に確かめる**（design D7）。401 や通信の失敗では保存しない
  const api = createApi({ baseUrl: apiBaseUrl(), token: value });
  const result = await loginWithToken(api, value);
  if (!result.ok) {
    console.error(loginFailureMessage(result.reason, apiBaseUrl()));
    return 1;
  }

  console.log(`保存しました: ${result.path}`);
  return 0;
}

async function memoAdd(command: Extract<ParsedCommand, { kind: "memo-add" }>): Promise<number> {
  let contents = command.contents;

  if (command.file !== null) {
    let text: string;
    try {
      text = readFileSync(command.file, "utf8");
    } catch {
      console.error(`ファイルを読めませんでした: ${command.file}`);
      return 1;
    }
    contents = splitMemos(text);
  }

  if (contents.length === 0) {
    console.error("登録する本文がありません");
    return 2;
  }

  if (command.dryRun) {
    const lines = formatDryRun(contents);
    console.log(command.json ? JSON.stringify({ contents }, null, 2) : lines.join("\n"));
    return 0;
  }

  const api = connect();
  if (api === null) return 1;

  let result: AddResult;
  try {
    result = await api.addMemos(contents);
  } catch {
    console.error("送れませんでした。ネットワークと REMORU_API_URL を確かめてください");
    return 1;
  }

  // 429 のときだけ、受け取った時刻 + retry-after 秒を再開できる時刻にする
  const resumeAt =
    !result.ok && result.retryAfterSeconds !== undefined
      ? Date.now() + result.retryAfterSeconds * 1000
      : undefined;

  if (command.json) {
    // 同じ情報を構造化して出す。再開時刻はエポックミリ秒で添える
    const output = resumeAt === undefined ? result : { ...result, resumeAt };
    console.log(JSON.stringify(output, null, 2));
    if (!result.ok) console.error(reasonLabel(result.error));
    return result.ok && result.results.every((r) => r.ok) ? 0 : 1;
  }

  const report = reportAdd(contents, result, { resumeAt });
  if (report.lines.length > 0) console.log(report.lines.join("\n"));
  if (report.errors.length > 0) console.error(report.errors.join("\n"));
  return report.exitCode;
}

async function memoList(command: Extract<ParsedCommand, { kind: "memo-list" }>): Promise<number> {
  const api = connect();
  if (api === null) return 1;

  // `--tag` は名前でも id でも受ける。名前なら id に直してから問い合わせる
  let tagId = command.tag ?? undefined;
  if (command.tag !== null) {
    const tags = await safeTags(api);
    if (tags === null) return 1;

    const named = tags.find((t) => t.name === command.tag);
    if (named !== undefined) {
      tagId = named.id;
    } else if (isUuid(command.tag)) {
      tagId = command.tag;
    } else {
      // 知らない名前をそのまま id として送ると「メモはありません」になり、
      // 間違いに気づけない
      console.error(`その名前のタグはありません: ${command.tag}`);
      console.error("タグの名前は remoru tag list で確かめられます");
      return 1;
    }
  }

  try {
    const result = await api.listMemos({
      tag: tagId,
      limit: command.limit ?? undefined,
    });

    if (!result.ok) {
      console.error(`読めませんでした: ${reasonLabel(result.error)}`);
      return 1;
    }

    if (command.json) {
      console.log(JSON.stringify(result.data, null, 2));
      return 0;
    }

    if (result.data.length === 0) {
      console.log("メモはありません");
      return 0;
    }

    for (const memo of result.data) console.log(formatMemo(memo).join("\n"));
    return 0;
  } catch {
    console.error("読めませんでした。ネットワークと REMORU_API_URL を確かめてください");
    return 1;
  }
}

async function memoShow(command: Extract<ParsedCommand, { kind: "memo-show" }>): Promise<number> {
  const api = connect();
  if (api === null) return 1;

  try {
    const result = await api.getMemo(command.memoId);
    if (!result.ok) {
      console.error(
        result.status === 404
          ? "メモが見つかりません"
          : `読めませんでした: ${reasonLabel(result.error)}`,
      );
      return 1;
    }

    console.log(
      command.json
        ? JSON.stringify(result.data, null, 2)
        : formatMemoDetail(result.data).join("\n"),
    );
    return 0;
  } catch {
    console.error("読めませんでした。ネットワークと REMORU_API_URL を確かめてください");
    return 1;
  }
}

async function tagList(json: boolean): Promise<number> {
  const api = connect();
  if (api === null) return 1;

  const tags = await safeTags(api);
  if (tags === null) return 1;

  if (json) {
    console.log(JSON.stringify(tags, null, 2));
    return 0;
  }

  if (tags.length === 0) {
    console.log("タグはありません");
    return 0;
  }

  console.log(tags.map(formatTag).join("\n"));
  return 0;
}

/** 調査するAIが読む手順の文書を、利用者単位の置き場へ置く（design D9）。 */
function skillInstall(dir: string | null): number {
  const target = dir ?? defaultSkillDir();

  let result: ReturnType<typeof installSkill>;
  try {
    result = installSkill(target);
  } catch {
    console.error(`手順の文書を置けませんでした: ${target}`);
    return 1;
  }

  if (!result.ok) {
    console.error(result.message);
    return 1;
  }

  console.log(`置きました: ${result.path}`);
  return 0;
}

/** タグの一覧。失敗は案内を出して null。 */
async function safeTags(api: Api): Promise<ApiTag[] | null> {
  try {
    const result = await api.listTags();
    if (!result.ok) {
      console.error(`タグを読めませんでした: ${reasonLabel(result.error)}`);
      return null;
    }
    return result.data;
  } catch {
    console.error("読めませんでした。ネットワークと REMORU_API_URL を確かめてください");
    return null;
  }
}

/** UUID の形か。`--tag` に id を直接渡したときのため。 */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

process.exitCode = await main(process.argv.slice(2));
