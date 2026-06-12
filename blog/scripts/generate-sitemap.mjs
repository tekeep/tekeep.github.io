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
  const urls = posts.map(f => {
    // filename without extension is the slug
    const slug = f.replace(/\.mdx?$/, '');
    return `${baseUrl}${slug}/`;
  });
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}</loc></url>
  ${urls.map(u => `<url><loc>${u}</loc></url>`).join('\n  ')}
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
