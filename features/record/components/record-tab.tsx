type LearningRecord = { recalled: number; layers: { label: string; count: number }[] };

/**
 * おぼえてきたこと。
 *
 * **上と下で性格が逆**（design.md D2）。累計は積み上げてきたことで減らず、
 * 層はいまの姿なので減りうる。下が動いても、上が守る。
 *
 * **達成率・連続記録・順位は出さない**（spec の MUST NOT）。分母を持つものは
 * 届いていない部分を作り出し、利用者を責める。
 *
 * 取得はしない。`app/(app)/_containers/learning-record/` が Server Components で
 * 取り、ここは表示だけを担う（server-side-reads D2）。
 */
export function RecordTab({ record }: { record: LearningRecord | null }) {
  // 真っ白にしない。見出しだけでも残すと「壊れた」に見えない
  if (!record) {
    return (
      <div>
        <h2 className="section-head">おぼえてきたこと</h2>
        <p className="muted">読み込めませんでした</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-head">おぼえてきたこと</h2>

      <p className="record-total">
        {record.recalled}
        <span>回</span>
      </p>
      <p className="muted" style={{ marginBottom: "2rem" }}>
        思い出しました
      </p>

      {record.recalled === 0 ? (
        /* 促さない。復習が0件のときの「今日は、なし」と同じ調子（design.md D7） */
        <p className="muted">まだありません</p>
      ) : (
        <>
          <p className="field-label">いま持っているもの</p>
          {/* 下が土台。間隔の短い層から積む */}
          {[...record.layers].reverse().map((layer) => (
            <div key={layer.label} className="layer">
              <span className="layer-name">{layer.label}</span>
              <span className="layer-bar">
                {/*
                 * **1件あたりの長さを固定にする。** 最大値で割ると、件数が
                 * 変わっていない層の棒が、別の層が伸びただけで縮む。何も
                 * 失っていないのに短くなるのは、分母を持つのと同じこと。
                 */}
                {layer.count > 0 && <i style={{ width: `min(100%, ${layer.count * 5}%)` }} />}
              </span>
              <b className="layer-count">{layer.count}</b>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
