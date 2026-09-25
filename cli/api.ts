/**
 * 取り込みAPIのクライアント。
 *
 * **薄い。** メモの切り分けも検証もしない。運ぶだけである（design D7）。
 * `fetch` を差し替えられる形にして、通信に出ずに応答の扱いを確かめる。
 */

/** 1回の要求で送る件数。`features/import/import-api.ts` の MAX_IMPORT_ITEMS と同じ。 */
export const BATCH_SIZE = 20;

export type ImportItemResult = { ok: true; memoId: string } | { ok: false; reason: string };

export type ApiReviewState =
  | { kind: "unwritten" }
  | { kind: "generating" }
  | { kind: "scheduled"; nextReviewAt: number; question: string };

export type ApiMemo = {
  id: string;
  content: string;
  createdAt: number;
  tags: { id: string; name: string }[];
  review: ApiReviewState;
};

export type ApiMemoDetail = ApiMemo & { answer: string | null };

export type ApiTag = { id: string; name: string; count: number };

export type ApiFailure = { ok: false; status: number; error: string };

export type AddResult =
  | { ok: true; results: ImportItemResult[] }
  /** 途中で失敗したときは、それまでに受理された結果も返す */
  | { ok: false; status: number; error: string; results: ImportItemResult[] };

export type Api = {
  addMemos(contents: string[]): Promise<AddResult>;
  listMemos(params: { tag?: string; limit?: number }): Promise<ApiResult<ApiMemo[]>>;
  getMemo(memoId: string): Promise<ApiResult<ApiMemoDetail>>;
  listTags(): Promise<ApiResult<ApiTag[]>>;
};

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export function createApi(options: {
  baseUrl: string;
  token: string;
  /** テストが差し替える。既定はグローバルの `fetch` */
  fetch?: typeof fetch;
}): Api {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, "");

  async function request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ response: Response; json: unknown }> {
    const response = await doFetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${options.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    return { response, json };
  }

  function failure(response: Response, json: unknown): ApiFailure {
    const error =
      typeof json === "object" &&
      json !== null &&
      typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : `http_${response.status}`;
    return { ok: false, status: response.status, error };
  }

  return {
    async addMemos(contents) {
      const results: ImportItemResult[] = [];

      for (let i = 0; i < contents.length; i += BATCH_SIZE) {
        const batch = contents.slice(i, i + BATCH_SIZE);
        const { response, json } = await request("POST", "/api/memos", batch);

        if (!response.ok) {
          return { ...failure(response, json), results };
        }

        const items = (json as { results?: ImportItemResult[] } | null)?.results ?? [];
        // 件数が合わない応答を受け取ったら、**本文と結果の取り違え**が起きる。
        // 黙って添字で突き合わせない
        if (items.length !== batch.length) {
          return { ok: false, status: response.status, error: "invalid_response", results };
        }
        results.push(...items);
      }

      return { ok: true, results };
    },

    async listMemos(params) {
      const query = new URLSearchParams();
      if (params.tag !== undefined) query.set("tag", params.tag);
      if (params.limit !== undefined) query.set("limit", String(params.limit));

      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      const { response, json } = await request("GET", `/api/memos${suffix}`);
      if (!response.ok) return failure(response, json);

      return { ok: true, data: (json as { memos?: ApiMemo[] } | null)?.memos ?? [] };
    },

    async getMemo(memoId) {
      const { response, json } = await request("GET", `/api/memos/${encodeURIComponent(memoId)}`);
      if (!response.ok) return failure(response, json);

      const memo = (json as { memo?: ApiMemoDetail } | null)?.memo;
      if (memo === undefined)
        return { ok: false, status: response.status, error: "invalid_response" };

      return { ok: true, data: memo };
    },

    async listTags() {
      const { response, json } = await request("GET", "/api/tags");
      if (!response.ok) return failure(response, json);

      return { ok: true, data: (json as { tags?: ApiTag[] } | null)?.tags ?? [] };
    },
  };
}
