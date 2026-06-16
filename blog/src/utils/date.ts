/**
 * 日付文字列を "YYYY/MM/DD" 形式にフォーマットする
 * @param dateStr - Frontmatterから取得した日付文字列 (例: "2026-06-15")
 * @returns フォーマット済み文字列。無効な日付の場合は空文字を返す。
 */
export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * JST（日本時間）基準で今日の日付を "YYYY-MM-DD" 形式で返す。
 * new Date() の UTC 比較では定時ビルド（JST 01:00 = UTC 16:00 前日）時に
 * 当日公開の記事が「未来」と誤判定されるため、文字列比較で正しく判定する。
 */
export function getTodayJST(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

/**
 * publishedAt が JST 基準で公開済み（今日以前）かどうかを判定する。
 * @param publishedAt - "YYYY-MM-DD" 形式の公開日文字列
 */
export function isPublished(publishedAt: string): boolean {
  return publishedAt <= getTodayJST();
}
