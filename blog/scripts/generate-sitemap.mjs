// scripts/generate-sitemap.mjs
import fs from 'fs';
import path from 'path';

const baseUrl = 'https://tekeep.com/blog/';

function buildSitemap() {
  const contentDir = path.resolve('src/content/blog');
  let files = [];
  try {
    files = fs.readdirSync(contentDir);
  } catch (e) {
    console.error('Could not read content directory', e);
    return;
  }
  
  const posts = files.filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
  
  const today = new Date().toISOString().split('T')[0];
  
  const urlEntries = posts.map(f => {
    const slug = f.replace(/\.mdx?$/, '');
    const url = `${baseUrl}${slug}/`;
    
    // Markdownファイルから updatedAt または publishedAt を抽出
    const content = fs.readFileSync(path.join(contentDir, f), 'utf-8');
    const updateMatch = content.match(/updatedAt:\s*"?([\d-]+)"?/);
    const publishMatch = content.match(/publishedAt:\s*"?([\d-]+)"?/);
    
    let lastmod = '';
    if (updateMatch && updateMatch[1]) {
      lastmod = updateMatch[1];
    } else if (publishMatch && publishMatch[1]) {
      lastmod = publishMatch[1];
    }
    
    return { url, lastmod };
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
