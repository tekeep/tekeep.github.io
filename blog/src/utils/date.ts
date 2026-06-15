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
