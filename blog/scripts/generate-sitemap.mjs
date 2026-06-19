// scripts/generate-sitemap.mjs
import fs from 'fs';
import path from 'path';

const baseUrl = 'https://tekeep.com/blog/';

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

function buildSitemap() {
  const contentDir = path.resolve('src/content/blog');
  let files = [];
  try {
    files = getAllFiles(contentDir);
  } catch (e) {
    console.error('Could not read content directory', e);
    return;
  }
  
  const posts = files.filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
  
  // 日本時間（JST）基準で今日の日付を取得（UTC比較によるズレを防ぐ）
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  
  const urlEntries = posts.map(f => {
    const slug = path.basename(f).replace(/\.mdx?$/, '');
    const url = `${baseUrl}${slug}/`;
    
    // Markdownファイルから updatedAt または publishedAt を抽出
    const content = fs.readFileSync(f, 'utf-8');
    const updateMatch = content.match(/updatedAt:\s*"?([\d-]+)"?/);
    const publishMatch = content.match(/publishedAt:\s*"?([\d-]+)"?/);
    
    let publishedAt = publishMatch && publishMatch[1] ? publishMatch[1] : '';
    let lastmod = '';
    if (updateMatch && updateMatch[1]) {
      lastmod = updateMatch[1];
    } else if (publishedAt) {
      lastmod = publishedAt;
    }
    
    return { url, lastmod, publishedAt };
  }).filter(entry => {
    // 未来の日付（公開予約）の記事はサイトマップから除外する（日本時間基準で文字列比較）
    if (entry.publishedAt) {
      return entry.publishedAt <= today;
    }
    return true; // 日付がない場合はとりあえず含める
  });
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${today}</lastmod>
  </url>
${urlEntries.map(entry => `  <url>
    <loc>${entry.url}</loc>${entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`;
  
  const outPath = path.resolve('public', 'sitemap.xml');
  fs.writeFileSync(outPath, sitemap, 'utf8');
  
  // ビルド済みの dist フォルダが存在する場合はそちらにも出力する（GitHub Actions等でのデプロイ用）
  const distDir = path.resolve('dist');
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.resolve(distDir, 'sitemap.xml'), sitemap, 'utf8');
  }
  
  console.log('Sitemap generated at', outPath);
}

buildSitemap();
