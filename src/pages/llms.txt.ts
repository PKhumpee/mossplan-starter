// /llms.txt endpoint (DESIGN §11.3, D32, T14).
// Plain Markdown index per llmstxt.org.
import type { APIRoute } from 'astro';
import { getAllCategories, getArticlesByCategory, getSiteInfo } from '../lib/content/queries';
import { buildSite } from '../shared/site';

export const prerender = true;

export const GET: APIRoute = () => {
  const siteInfo = getSiteInfo();
  const site = buildSite();

  if (site.noindex) {
    return new Response(`# ${siteInfo.name}\n`, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const categories = getAllCategories();

  let body = `# ${siteInfo.name}\n\n`;
  body += `> ${siteInfo.description}\n\n`;
  body += `เว็บไซต์เผยแพร่บทความ ข่าวสาร และคู่มือที่เขียนโดยกองบรรณาธิการผู้เชี่ยวชาญ คัดกรองและตรวจสอบข้อมูลตามหลักจริยธรรมสื่อและความน่าเชื่อถือ (E-E-A-T)\n\n`;

  for (const cat of categories) {
    const articles = getArticlesByCategory(cat.id);
    if (articles.length === 0) continue;

    body += `## ${cat.name}\n\n`;
    for (const a of articles) {
      const url = `${site.url}/${a.slug}/`;
      body += `- [${a.title}](${url}): ${a.excerpt}\n`;
    }
    body += '\n';
  }

  body += `## เกี่ยวกับเว็บไซต์\n\n`;
  body += `- [เกี่ยวกับเรา](${site.url}/about/): ข้อมูลทีมงานและพันธกิจของ ${siteInfo.name}\n`;
  body += `- [ทีมผู้เขียน](${site.url}/authors/): รายชื่อผู้เขียนและผู้ตรวจทานเนื้อหา\n`;
  body += `- [นโยบายกองบรรณาธิการ](${site.url}/editorial-policy/): มาตรฐานการจัดทำเนื้อหา\n`;
  body += `- [การเปิดเผยข้อมูล](${site.url}/disclosure/): นโยบายความโปร่งใส\n`;
  body += `- [นโยบายความเป็นส่วนตัว](${site.url}/privacy/): การคุ้มครองข้อมูลส่วนบุคคล\n`;
  body += `- [ข้อกำหนดการใช้งาน](${site.url}/terms/): เงื่อนไขการเข้าชมเว็บไซต์\n`;
  body += `- [ติดต่อเรา](${site.url}/contact/): ช่องทางการติดต่อกองบรรณาธิการ\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
