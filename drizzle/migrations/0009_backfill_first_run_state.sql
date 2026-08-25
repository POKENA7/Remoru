-- 既に問答を持っている利用者を「導き済み」として埋める。
--
-- first_run_state は change 11 で作った表なので、それ以前から使っている人は
-- 記録が無い＝未了と判定される。すると、ずっと前に書いたメモに「初めての
-- 告知」が出る。間隔ではなく、表を作った時点を測ってしまっている。
--
-- 問答を1つでも持つ人は、既に仕組みを見ている。guided_at は分からないので、
-- 問答が最初に作られた時刻を使う。
INSERT OR IGNORE INTO first_run_state (user_id, guided_at)
SELECT m.user_id, MIN(q.created_at)
FROM quiz_items q
JOIN memos m ON m.id = q.memo_id
GROUP BY m.user_id;
