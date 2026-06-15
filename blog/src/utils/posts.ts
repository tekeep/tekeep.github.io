import type { CollectionEntry } from 'astro:content';

/**
 * 記事を公開日の降順でソートする。
 * 同一日付の場合は articleId の降順（新しい記事が上）を2次ソートキーとして使う。
 */
export function sortPosts(posts: CollectionEntry<'blog'>[]): CollectionEntry<'blog'>[] {
  return [...posts].sort((a, b) => {
    const dateDiff = new Date(b.data.publishedAt).getTime() - new Date(a.data.publishedAt).getTime();
    if (dateDiff !== 0) return dateDiff;
    // 同日の場合は articleId 降順（例: 20251012-02 > 20251012-01）
    return (b.data.articleId ?? '').localeCompare(a.data.articleId ?? '');
  });
}
