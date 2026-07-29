// Builds the in-memory "dist" for a website's PUBLISHED pages - an array of
// {path, content, contentType} files ready for a deploy provider to upload
// directly (no actual filesystem dist/ folder; simpler and works identically
// for local vs cloud deploys).
//
// NOT implemented in this pass (documented rather than faked): image
// re-encoding/resizing (asset URLs are used as-is), and true JS
// code-splitting/tree-shaking - this output has no JS bundle to split, since
// none of the 20 blocks need client-side JS (the one exception, the FAQ
// block's expand/collapse, already uses the native <details> element).
const { minify } = require("html-minifier-terser");
const fs = require("fs");
const path = require("path");
const { renderBlockToHtml } = require("./blockTemplates");
const { buildThemeStyle, googleFontsHref } = require("../utils/blockStyle");
const { resolveBlockDataSource } = require("../utils/dataSource");

const STATIC_CSS = fs.readFileSync(path.join(__dirname, "../generated/static-site.css"), "utf8");

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

// Page-linked nav items only store `pageId` in the DB, not a real href (see
// Navigation.items' schema comment) - this was previously left unresolved
// here (staticSiteGenerator.js queries the raw `navigation: true` Prisma
// relation, not routes/builder.js's withResolvedLabels or routes/public.js's
// resolvePublicNavItems), meaning page-linked nav entries silently rendered
// with no working href in the static export. Fixed as part of the same pass
// that made Navbar actually render nested children/mega-menu/mobile-menu -
// this resolveNavItems mirrors those two routes' logic exactly.
function resolveNavItems(items, pagesById) {
  return (items || [])
    .filter((item) => item.linkType !== "page" || pagesById.has(item.pageId))
    .map((item) => {
      const resolved = { ...item };
      if (item.linkType === "page") {
        const page = pagesById.get(item.pageId);
        resolved.label = item.label || page.title;
        resolved.href = page.isHome ? "/" : `/${page.slug}`;
      } else {
        resolved.href = item.url;
      }
      if (item.children?.length) resolved.children = resolveNavItems(item.children, pagesById);
      return resolved;
    });
}

function mapNavItems(items) {
  return (items || []).map((item) => ({
    label: item.label,
    href: item.href,
    children: item.children?.length ? mapNavItems(item.children) : undefined,
  }));
}

function mergeHeaderProps(sourceProps, navigation, pagesById) {
  if (!navigation) return sourceProps;
  const resolvedItems = resolveNavItems(navigation.items, pagesById);
  return { ...sourceProps, links: mapNavItems(resolvedItems), style: navigation.style, sticky: navigation.sticky, transparent: navigation.transparent };
}

// Same GlobalComponentRef resolution as routes/public.js / DynamicRenderer.vue,
// ported here so the generator doesn't need a live HTTP round-trip to resolve
// them. Dynamic-mode blocks (MenuShowcase/OpeningHours/BranchLocator) are
// resolved against already-fetched live data the same way; Breadcrumb gets
// `currentLabel` auto-filled from the page's own title when blank.
function resolveBlocks(blocks, globalComponentsByKey, navigation, pagesById, liveData, pageTitle) {
  return (blocks || [])
    .map((rawBlock) => {
      let block = rawBlock;
      if (block.type === "GlobalComponentRef") {
        const source = globalComponentsByKey.get(block.key);
        if (!source) return null;
        block = { type: source.blockType, props: block.key === "HEADER" ? mergeHeaderProps(source.props, navigation, pagesById) : source.props };
      }
      block = resolveBlockDataSource(block, liveData);
      if (block.type === "Breadcrumb" && !block.props?.currentLabel && pageTitle) {
        block = { ...block, props: { ...block.props, currentLabel: pageTitle } };
      }
      return block;
    })
    .filter(Boolean);
}

// Every page/site link the block templates render (nav, footer, CTA buttons,
// blog/portfolio/card "read more" links) is written as a site-root-relative
// href like "/contact" - correct only if the site is actually served from its
// origin's root. It isn't: today's only working deploy target is the shared
// Spaces bucket's CDN, where every site lives under /sites/{websiteId}/live
// (see spacesStaticHost.js), and a custom domain would need reverse-proxy
// routing that was never built (out of scope - domains only get DNS
// verification + an sslStatus field). So every "/..." href is rewritten with
// that same prefix, or this HTML is unusable the moment a user clicks
// anything (the CSS/manifest/favicon 403s reported were this same bug for
// the three hardcoded absolute asset links below - single fix, same cause).
// `//host/...` (protocol-relative) and absolute http(s)/mailto/tel/#anchor
// hrefs are left untouched by the negative lookahead.
function rewriteInternalLinks(html, basePath) {
  if (!basePath) return html;
  return html.replace(/href="\/(?!\/)/g, `href="${basePath}/`);
}

function renderPageBody(page, globalComponentsByKey, navigation, pagesById, basePath, liveData) {
  const resolved = resolveBlocks(page.publishedBlocks?.blocks, globalComponentsByKey, navigation, pagesById, liveData, page.title);
  const bodyHtml = resolved.map((block) => renderBlockToHtml(block.type, block.props)).join("\n");
  return rewriteInternalLinks(bodyHtml, basePath);
}

function buildHtmlDocument({ title, description, ogImage, canonicalUrl, bodyHtml, basePath, faviconUrl, theme }) {
  const fontHref = googleFontsHref(theme);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeXml(title)}</title>
${description ? `<meta name="description" content="${escapeXml(description)}" />` : ""}
${canonicalUrl ? `<link rel="canonical" href="${escapeXml(canonicalUrl)}" />` : ""}
<meta property="og:title" content="${escapeXml(title)}" />
${description ? `<meta property="og:description" content="${escapeXml(description)}" />` : ""}
${ogImage ? `<meta property="og:image" content="${escapeXml(ogImage)}" />` : ""}
<meta property="og:type" content="website" />
${faviconUrl ? `<link rel="icon" href="${escapeXml(faviconUrl)}" />` : ""}
<link rel="manifest" href="${basePath}/manifest.json" />
<link rel="stylesheet" href="${basePath}/assets/site.css" />
${fontHref ? `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="${escapeXml(fontHref)}" />` : ""}
</head>
<body class="tw-antialiased" style="${escapeXml(buildThemeStyle(theme))}">
${bodyHtml}
</body>
</html>`;
}

function buildSitemap(pages, baseUrl) {
  const urls = pages
    .map((p) => `  <url><loc>${escapeXml(baseUrl)}${p.isHome ? "/" : `/${p.slug}/`}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function buildRobots(baseUrl) {
  return `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

function buildManifest(companyName, logoUrl, basePath) {
  return JSON.stringify(
    {
      name: companyName,
      short_name: companyName,
      start_url: `${basePath}/`,
      display: "standalone",
      icons: logoUrl ? [{ src: logoUrl, sizes: "512x512", type: "image/png" }] : [],
    },
    null,
    2
  );
}

// website: Website row with `pages` (PUBLISHED only), `navigation`, `globalComponents`.
// company: { name, logoUrlLong, logoUrlShort }. baseUrl: the site's own URL,
// used for sitemap/canonical/OG - pass the deploy provider's preview URL when
// no custom domain is set yet. liveData: { menuCategories, branches } for
// dynamic-mode blocks (see publishWorker.js, which queries these via Prisma).
async function generateStaticSite({ website, company, baseUrl, liveData }) {
  const globalComponentsByKey = new Map((website.globalComponents || []).map((c) => [c.key, c]));
  const pagesById = new Map((website.pages || []).map((p) => [p.id, p]));

  // baseUrl is either a real custom domain ("https://www.example.com", no
  // path) or the interim Spaces CDN preview URL, which always includes the
  // "/sites/{websiteId}/live" path this site is actually deployed under -
  // basePath is that path component, "" for a real domain at its own root.
  const basePath = baseUrl ? new URL(baseUrl).pathname.replace(/\/$/, "") : "";
  const faviconUrl = company.logoUrlShort || company.logoUrlLong || "";

  const files = [];

  for (const page of website.pages || []) {
    const bodyHtml = renderPageBody(page, globalComponentsByKey, website.navigation, pagesById, basePath, liveData);
    const html = buildHtmlDocument({
      title: page.seoTitle || `${page.title} - ${company.name}`,
      description: page.seoDescription || company.description || "",
      ogImage: company.coverImageUrl || company.logoUrlLong || "",
      canonicalUrl: baseUrl ? `${baseUrl}${page.isHome ? "" : `/${page.slug}`}` : "",
      bodyHtml,
      basePath,
      faviconUrl,
      theme: website.theme,
    });
    const minified = await minify(html, {
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: false, // CSS is already minified separately (build:static-css)
      minifyJS: true,
    });
    const filePath = page.isHome ? "index.html" : `${page.slug}/index.html`;
    files.push({ path: filePath, content: minified, contentType: "text/html" });
  }

  files.push({ path: "assets/site.css", content: STATIC_CSS, contentType: "text/css" });

  if (baseUrl) {
    files.push({ path: "sitemap.xml", content: buildSitemap(website.pages || [], baseUrl), contentType: "application/xml" });
    files.push({ path: "robots.txt", content: buildRobots(baseUrl), contentType: "text/plain" });
  }
  files.push({ path: "manifest.json", content: buildManifest(company.name, company.logoUrlShort || company.logoUrlLong, basePath), contentType: "application/json" });

  return { files };
}

module.exports = { generateStaticSite };
