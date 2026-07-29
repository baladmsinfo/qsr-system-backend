// Plain-JS ports of qsr-system-admin/app/components/builder-blocks/*.vue, used
// only by the static site generator (routes/builder.js publish pipeline).
//
// Why a third copy of markup that already exists as Vue SFCs in both frontend
// apps: Nitro (qsr-system-frondend's server/ build) has no Vue SFC compiler
// wired in, so a "hit a Nitro route that renders DynamicRenderer" approach
// (the original plan) fails outright - confirmed empirically, not assumed.
// Compiling .vue files inside this plain Node backend via esbuild+Vue-SFC
// tooling was the other option; these are simple, mostly-static templates, so
// hand-porting them here is less fragile than adding an SFC-compilation
// pipeline to a JS-only Fastify backend that has never needed one.
//
// IMPORTANT: class names here must stay byte-for-byte identical to the .vue
// source, because the static site's CSS is PRE-compiled once from those .vue
// files (see scripts/build-static-css in qsr-system-frondend) - a class used
// here but not in the .vue source won't exist in the shipped CSS.
//
// Theme colors (tw-*-[var(--theme-primary,#6D28D9)] etc.) and per-block
// background (bgColor/bgImage/bgOverlayOpacity via buildBgStyle) follow the
// same rule: identical arbitrary-value classes and the same `style=` wiring
// must be mirrored in both .vue copies whenever a block changes here.
const { buildBgStyle } = require("../utils/blockStyle");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

// Per-block background override as an inline style attribute string (empty
// when neither bgColor nor bgImage is set) - wins over the block's own
// Tailwind bg-* class without needing to touch or remove it.
function bgAttr(p) {
  const bg = buildBgStyle(p);
  return bg ? ` style="${escapeHtml(bg)}"` : "";
}

function navChildMenu(children, style) {
  if (!children?.length) return "";
  return `
          <div class="tw-invisible tw-opacity-0 group-hover:tw-visible group-hover:tw-opacity-100 tw-transition tw-absolute tw-top-full tw-pt-2 tw-z-30 ${style === "mega" ? "tw-left-1/2 -tw-translate-x-1/2 tw-w-[36rem]" : "tw-left-0 tw-w-56"}">
            <div class="tw-rounded-xl tw-bg-white dark:tw-bg-slate-900 tw-border tw-border-slate-100 dark:tw-border-slate-800 tw-shadow-lg tw-p-4">
              <div class="${style === "mega" ? "tw-grid tw-grid-cols-2 tw-gap-2" : "tw-space-y-1"}">
                ${children
                  .map(
                    (child) => `
                <div>
                  <a href="${escapeHtml(child.href)}" class="tw-block tw-rounded-md tw-px-2 tw-py-1.5 tw-text-sm tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-50 dark:hover:tw-bg-slate-800">${escapeHtml(child.label)}</a>
                  ${
                    child.children?.length
                      ? `<div class="tw-ml-3 tw-mt-1 tw-space-y-1 tw-border-l tw-border-slate-100 dark:tw-border-slate-800 tw-pl-2">
                    ${child.children.map((gc) => `<a href="${escapeHtml(gc.href)}" class="tw-block tw-text-xs tw-text-slate-500 dark:tw-text-slate-400 hover:tw-text-[var(--theme-primary,#6D28D9)] tw-py-1">${escapeHtml(gc.label)}</a>`).join("\n")}
                  </div>`
                      : ""
                  }
                </div>`
                  )
                  .join("\n")}
              </div>
            </div>
          </div>`;
}

function navMobileMenu(links, ctaLabel, ctaLink) {
  return `
      <details class="md:tw-hidden tw-relative">
        <summary class="tw-list-none tw-cursor-pointer tw-h-9 tw-w-9 tw-flex tw-items-center tw-justify-center tw-text-slate-700 dark:tw-text-slate-200">
          <i class="mdi mdi-menu tw-text-2xl"></i>
        </summary>
        <div class="tw-absolute tw-right-0 tw-top-full tw-mt-2 tw-w-64 tw-rounded-xl tw-bg-white dark:tw-bg-slate-900 tw-border tw-border-slate-100 dark:tw-border-slate-800 tw-shadow-lg tw-p-3 tw-space-y-1">
          ${(links || [])
            .map((link) =>
              !link.children?.length
                ? `<a href="${escapeHtml(link.href)}" class="tw-block tw-rounded-md tw-px-3 tw-py-2 tw-text-sm tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-50 dark:hover:tw-bg-slate-800">${escapeHtml(link.label)}</a>`
                : `<details class="tw-rounded-md">
            <summary class="tw-list-none tw-cursor-pointer tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-text-sm tw-text-slate-700 dark:tw-text-slate-200 hover:tw-bg-slate-50 dark:hover:tw-bg-slate-800">${escapeHtml(link.label)}<i class="mdi mdi-chevron-down tw-text-xs"></i></summary>
            <div class="tw-pl-4 tw-space-y-1">
              ${link.children.map((child) => `<a href="${escapeHtml(child.href)}" class="tw-block tw-rounded-md tw-px-3 tw-py-1.5 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300 hover:tw-bg-slate-50 dark:hover:tw-bg-slate-800">${escapeHtml(child.label)}</a>`).join("\n")}
            </div>
          </details>`
            )
            .join("\n")}
          ${ctaLabel ? `<a href="${escapeHtml(ctaLink)}" class="tw-block tw-mt-2 tw-rounded-full tw-bg-[var(--theme-primary,#6D28D9)] tw-px-3 tw-py-2 tw-text-center tw-text-sm tw-font-medium tw-text-white">${escapeHtml(ctaLabel)}</a>` : ""}
        </div>
      </details>`;
}

const renderers = {
  Navbar(p) {
    const sticky = p.sticky !== false;
    const transparent = p.variant === "transparent-hero" || p.transparent === true;
    const minimal = p.variant === "minimal";
    return `
<header class="tw-z-20 tw-backdrop-blur ${sticky ? "tw-sticky tw-top-0" : "tw-relative"} ${transparent ? "tw-bg-transparent tw-border-transparent" : "tw-bg-white/90 dark:tw-bg-slate-900/90 tw-border-slate-100 dark:tw-border-slate-800"} ${p.variant === "corporate" ? "tw-border-b-2 tw-shadow-sm" : "tw-border-b"}"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6 tw-flex tw-items-center tw-justify-between ${p.variant === "center-logo" ? "tw-relative" : ""} ${minimal ? "tw-h-12" : "tw-h-16"}">
    <div class="tw-flex tw-items-center tw-gap-2 ${p.variant === "center-logo" ? "tw-absolute tw-left-1/2 -tw-translate-x-1/2" : ""}">
      ${p.logoImageUrl && !minimal ? `<img src="${escapeHtml(p.logoImageUrl)}" alt="" class="tw-h-8 tw-w-8 tw-rounded tw-object-cover" loading="lazy" />` : ""}
      <span class="tw-font-bold tw-text-slate-900 dark:tw-text-white ${minimal ? "tw-text-base" : "tw-text-lg"}">${escapeHtml(p.logoText)}</span>
    </div>
    <nav class="tw-hidden md:tw-flex tw-items-center tw-gap-8">
      ${(p.links || [])
        .map(
          (l) => `
      <div class="tw-group tw-relative">
        <a href="${escapeHtml(l.href)}" class="tw-text-sm tw-font-medium tw-text-slate-600 dark:tw-text-slate-300 hover:tw-text-[var(--theme-primary,#6D28D9)] tw-flex tw-items-center tw-gap-1">
          ${escapeHtml(l.label)}${l.children?.length ? `<i class="mdi mdi-chevron-down tw-text-xs"></i>` : ""}
        </a>
        ${navChildMenu(l.children, p.style)}
      </div>`
        )
        .join("\n")}
    </nav>
    ${p.ctaLabel && !minimal ? `<a href="${escapeHtml(p.ctaLink)}" class="tw-hidden md:tw-inline-flex tw-rounded-full tw-bg-[var(--theme-primary,#6D28D9)] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white hover:tw-bg-[var(--theme-primary-hover,#5b21b6)] tw-transition">${escapeHtml(p.ctaLabel)}</a>` : ""}
    ${navMobileMenu(p.links, p.ctaLabel, p.ctaLink)}
  </div>
</header>`;
  },

  Hero(p) {
    const center = p.align === "center";
    return `
<section class="tw-relative tw-overflow-hidden tw-bg-white dark:tw-bg-slate-900"${bgAttr(p)}>
  <div class="${classNames("tw-mx-auto tw-max-w-6xl tw-px-6 tw-py-20 md:tw-py-28 tw-grid md:tw-grid-cols-2 tw-gap-12 tw-items-center", center && "tw-text-center md:tw-text-center")}">
    <div class="${center ? "md:tw-col-span-2 tw-mx-auto tw-max-w-2xl" : ""}">
      ${p.tag ? `<p class="tw-text-sm tw-font-semibold tw-uppercase tw-tracking-wide tw-text-[var(--theme-accent,#F59E0B)]">${escapeHtml(p.tag)}</p>` : ""}
      <h1 class="tw-mt-3 tw-text-4xl md:tw-text-5xl tw-font-extrabold tw-tracking-tight tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.headline)}</h1>
      ${p.subtext ? `<p class="tw-mt-5 tw-text-lg tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtext)}</p>` : ""}
      ${p.ctaLabel ? `<a href="${escapeHtml(p.ctaLink)}" class="tw-mt-8 tw-inline-flex tw-items-center tw-rounded-full tw-bg-[var(--theme-primary,#6D28D9)] tw-px-6 tw-py-3 tw-text-white tw-font-medium tw-shadow hover:tw-bg-[var(--theme-primary-hover,#5b21b6)] tw-transition">${escapeHtml(p.ctaLabel)}</a>` : ""}
    </div>
    ${!center ? `<div class="tw-relative tw-aspect-[4/3] tw-rounded-2xl tw-overflow-hidden tw-bg-slate-100 dark:tw-bg-slate-800">${p.imageUrl ? `<img src="${escapeHtml(p.imageUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" />` : ""}</div>` : ""}
  </div>
</section>`;
  },

  Features(p) {
    return `
<section class="tw-bg-slate-50 dark:tw-bg-slate-950 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
    <div class="tw-mt-12 tw-grid sm:tw-grid-cols-2 lg:tw-grid-cols-3 tw-gap-8">
      ${(p.items || [])
        .map(
          (item) => `
      <div class="tw-rounded-2xl tw-bg-white dark:tw-bg-slate-900 tw-p-6 tw-shadow-sm tw-border tw-border-slate-100 dark:tw-border-slate-800">
        <div class="tw-inline-flex tw-h-11 tw-w-11 tw-items-center tw-justify-center tw-rounded-xl tw-bg-violet-100 dark:tw-bg-violet-900/40">
          <i class="${escapeHtml(item.icon)} tw-text-[var(--theme-primary,#6D28D9)] tw-text-xl"></i>
        </div>
        <h3 class="tw-mt-4 tw-font-semibold tw-text-slate-900 dark:tw-text-white">${escapeHtml(item.title)}</h3>
        <p class="tw-mt-2 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(item.body)}</p>
      </div>`
        )
        .join("\n")}
    </div>
  </div>
</section>`;
  },

  RestaurantMenu(p) {
    return `
<section id="menu" class="tw-bg-white dark:tw-bg-slate-900 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-5xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
    <div class="tw-mt-12 tw-space-y-12">
      ${(p.categories || [])
        .map(
          (cat) => `
      <div>
        <h3 class="tw-text-xl tw-font-semibold tw-text-[var(--theme-accent,#F59E0B)] tw-mb-6">${escapeHtml(cat.name)}</h3>
        <div class="tw-grid sm:tw-grid-cols-2 tw-gap-6">
          ${(cat.items || [])
            .map(
              (item) => `
          <div class="tw-flex tw-gap-4">
            ${item.imageUrl ? `<div class="tw-h-16 tw-w-16 tw-shrink-0 tw-rounded-lg tw-overflow-hidden tw-bg-slate-100 dark:tw-bg-slate-800"><img src="${escapeHtml(item.imageUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" /></div>` : ""}
            <div class="tw-flex-1">
              <div class="tw-flex tw-items-baseline tw-justify-between tw-gap-4">
                <h4 class="tw-font-medium tw-text-slate-900 dark:tw-text-white">${escapeHtml(item.name)}</h4>
                ${item.price ? `<span class="tw-font-semibold tw-text-[var(--theme-primary,#6D28D9)] tw-whitespace-nowrap">₹${escapeHtml(item.price)}</span>` : ""}
              </div>
              ${item.description ? `<p class="tw-mt-1 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(item.description)}</p>` : ""}
            </div>
          </div>`
            )
            .join("\n")}
        </div>
      </div>`
        )
        .join("\n")}
    </div>
  </div>
</section>`;
  },

  Gallery(p) {
    return `
<section class="tw-bg-slate-50 dark:tw-bg-slate-950 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6">
    ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-center tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
    <div class="tw-mt-10 tw-grid tw-grid-cols-2 md:tw-grid-cols-3 tw-gap-4">
      ${(p.images || [])
        .map(
          (img) => `
      <div class="tw-relative tw-aspect-square tw-rounded-xl tw-overflow-hidden tw-bg-slate-200 dark:tw-bg-slate-800">
        ${img.url ? `<img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.caption)}" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" />` : ""}
        ${img.caption ? `<span class="tw-absolute tw-bottom-0 tw-inset-x-0 tw-bg-black/50 tw-text-white tw-text-xs tw-px-2 tw-py-1">${escapeHtml(img.caption)}</span>` : ""}
      </div>`
        )
        .join("\n")}
    </div>
  </div>
</section>`;
  },

  Testimonials(p) {
    return `
<section class="tw-bg-white dark:tw-bg-slate-900 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-5xl tw-px-6">
    ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-center tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
    <div class="tw-mt-12 tw-grid sm:tw-grid-cols-2 tw-gap-6">
      ${(p.items || [])
        .map(
          (item) => `
      <blockquote class="tw-rounded-2xl tw-bg-slate-50 dark:tw-bg-slate-800 tw-p-6">
        <i class="mdi mdi-format-quote-open tw-text-amber-500 tw-text-2xl"></i>
        <p class="tw-mt-2 tw-text-slate-700 dark:tw-text-slate-200 tw-italic">${escapeHtml(item.quote)}</p>
        <footer class="tw-mt-4 tw-text-sm tw-font-semibold tw-text-slate-900 dark:tw-text-white">
          ${escapeHtml(item.author)}
          ${item.role ? `<span class="tw-font-normal tw-text-slate-500 dark:tw-text-slate-400"> — ${escapeHtml(item.role)}</span>` : ""}
        </footer>
      </blockquote>`
        )
        .join("\n")}
    </div>
  </div>
</section>`;
  },

  Faq(p) {
    return `
<section class="tw-bg-slate-50 dark:tw-bg-slate-950 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-3xl tw-px-6">
    ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-center tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
    <div class="tw-mt-10 tw-space-y-4">
      ${(p.items || [])
        .map(
          (item) => `
      <details class="tw-group tw-rounded-xl tw-bg-white dark:tw-bg-slate-900 tw-border tw-border-slate-200 dark:tw-border-slate-800 tw-p-4">
        <summary class="tw-cursor-pointer tw-font-medium tw-text-slate-900 dark:tw-text-white tw-list-none tw-flex tw-items-center tw-justify-between">
          ${escapeHtml(item.question)}
          <i class="mdi mdi-chevron-down tw-transition group-open:tw-rotate-180"></i>
        </summary>
        <p class="tw-mt-3 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(item.answer)}</p>
      </details>`
        )
        .join("\n")}
    </div>
  </div>
</section>`;
  },

  Contact(p) {
    return `
<section id="contact" class="tw-bg-white dark:tw-bg-slate-900 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-5xl tw-px-6 tw-grid md:tw-grid-cols-2 tw-gap-10 tw-items-start">
    <div>
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
      <ul class="tw-mt-6 tw-space-y-3 tw-text-sm tw-text-slate-700 dark:tw-text-slate-200">
        ${p.address ? `<li class="tw-flex tw-gap-2"><i class="mdi mdi-map-marker tw-text-[var(--theme-primary,#6D28D9)]"></i>${escapeHtml(p.address)}</li>` : ""}
        ${p.phone ? `<li class="tw-flex tw-gap-2"><i class="mdi mdi-phone tw-text-[var(--theme-primary,#6D28D9)]"></i>${escapeHtml(p.phone)}</li>` : ""}
        ${p.email ? `<li class="tw-flex tw-gap-2"><i class="mdi mdi-email tw-text-[var(--theme-primary,#6D28D9)]"></i>${escapeHtml(p.email)}</li>` : ""}
      </ul>
    </div>
    <div class="tw-aspect-video tw-rounded-2xl tw-overflow-hidden tw-bg-slate-100 dark:tw-bg-slate-800">
      ${p.mapEmbedUrl ? `<iframe src="${escapeHtml(p.mapEmbedUrl)}" class="tw-h-full tw-w-full tw-border-0" loading="lazy"></iframe>` : ""}
    </div>
  </div>
</section>`;
  },

  Cta(p) {
    const bg = p.background === "dark" ? "tw-bg-slate-900" : p.background === "light" ? "tw-bg-slate-50 dark:tw-bg-slate-950" : "tw-bg-[var(--theme-primary,#6D28D9)]";
    const light = p.background === "light";
    return `
<section class="tw-py-16 ${bg}"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-3xl tw-px-6 tw-text-center">
    <h2 class="tw-text-3xl tw-font-bold ${light ? "tw-text-slate-900 dark:tw-text-white" : "tw-text-white"}">${escapeHtml(p.title)}</h2>
    ${p.subtitle ? `<p class="tw-mt-3 ${light ? "tw-text-slate-600 dark:tw-text-slate-300" : "tw-text-white/80"}">${escapeHtml(p.subtitle)}</p>` : ""}
    ${p.ctaLabel ? `<a href="${escapeHtml(p.ctaLink)}" class="tw-mt-8 tw-inline-flex tw-items-center tw-rounded-full tw-px-6 tw-py-3 tw-font-medium tw-transition ${light ? "tw-bg-[var(--theme-primary,#6D28D9)] tw-text-white hover:tw-bg-[var(--theme-primary-hover,#5b21b6)]" : "tw-bg-white tw-text-slate-900 hover:tw-bg-slate-100"}">${escapeHtml(p.ctaLabel)}</a>` : ""}
  </div>
</section>`;
  },

  Footer(p) {
    const showMap = p.variant === "map" && p.mapEmbedUrl;
    return `
${p.variant === "newsletter" ? renderers.Newsletter({ title: p.newsletterTitle || "Stay in the loop", subtitle: "", placeholder: "Enter your email", ctaLabel: "Subscribe" }) : ""}
<footer class="tw-bg-slate-900 tw-text-slate-300 tw-py-12 ${p.variant === "corporate" ? "tw-border-t-4 tw-border-[var(--theme-primary,#6D28D9)]" : ""}"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6 tw-flex tw-flex-col md:tw-flex-row tw-justify-between tw-gap-8">
    <div>
      <p class="tw-font-bold tw-text-white tw-text-lg">${escapeHtml(p.logoText)}</p>
      ${p.tagline ? `<p class="tw-mt-1 tw-text-sm tw-text-slate-400">${escapeHtml(p.tagline)}</p>` : ""}
      ${
        (p.socialLinks || []).length
          ? `<div class="tw-mt-4 tw-flex tw-gap-3">${(p.socialLinks || []).map((s) => `<a href="${escapeHtml(s.href)}" class="tw-text-slate-400 hover:tw-text-white"><i class="${escapeHtml(s.icon)} tw-text-lg"></i></a>`).join("")}</div>`
          : ""
      }
    </div>
    ${showMap ? `<div class="tw-aspect-video tw-w-full md:tw-w-80 tw-rounded-xl tw-overflow-hidden"><iframe src="${escapeHtml(p.mapEmbedUrl)}" class="tw-h-full tw-w-full tw-border-0" loading="lazy"></iframe></div>` : ""}
    <nav class="tw-flex tw-flex-wrap tw-gap-x-6 tw-gap-y-2">
      ${(p.links || []).map((l) => `<a href="${escapeHtml(l.href)}" class="tw-text-sm hover:tw-text-white">${escapeHtml(l.label)}</a>`).join("\n")}
    </nav>
  </div>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6 tw-mt-8 tw-pt-6 tw-border-t tw-border-slate-800 tw-text-xs tw-text-slate-500">${escapeHtml(p.copyrightText)}</div>
</footer>`;
  },

  Pricing(p) {
    const isHighlighted = (plan) => plan.highlighted === true || plan.highlighted === "true";
    return `
<section class="tw-bg-white dark:tw-bg-slate-900 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
    <div class="tw-mt-12 tw-grid sm:tw-grid-cols-2 lg:tw-grid-cols-3 tw-gap-8">
      ${(p.plans || [])
        .map((plan) => {
          const hl = isHighlighted(plan);
          return `
      <div class="tw-rounded-2xl tw-p-8 tw-border ${hl ? "tw-bg-[var(--theme-primary,#6D28D9)] tw-border-[var(--theme-primary,#6D28D9)] tw-text-white tw-shadow-lg tw-scale-105" : "tw-bg-slate-50 dark:tw-bg-slate-800 tw-border-slate-100 dark:tw-border-slate-700 tw-text-slate-900 dark:tw-text-white"}">
        <h3 class="tw-font-semibold tw-text-lg">${escapeHtml(plan.name)}</h3>
        <div class="tw-mt-3 tw-flex tw-items-baseline tw-gap-1">
          <span class="tw-text-4xl tw-font-extrabold">${escapeHtml(plan.price)}</span>
          ${plan.period ? `<span class="tw-text-sm tw-opacity-70">/${escapeHtml(plan.period)}</span>` : ""}
        </div>
        <ul class="tw-mt-6 tw-space-y-2 tw-text-sm">
          ${(plan.features || []).map((f) => `<li class="tw-flex tw-gap-2"><i class="mdi mdi-check"></i>${escapeHtml(f.value)}</li>`).join("\n")}
        </ul>
        ${plan.ctaLabel ? `<a href="${escapeHtml(plan.ctaLink)}" class="tw-mt-8 tw-inline-flex tw-w-full tw-justify-center tw-rounded-full tw-px-6 tw-py-3 tw-font-medium tw-transition ${hl ? "tw-bg-white tw-text-[var(--theme-primary,#6D28D9)] hover:tw-bg-slate-100" : "tw-bg-[var(--theme-primary,#6D28D9)] tw-text-white hover:tw-bg-[var(--theme-primary-hover,#5b21b6)]"}">${escapeHtml(plan.ctaLabel)}</a>` : ""}
      </div>`;
        })
        .join("\n")}
    </div>
  </div>
</section>`;
  },

  Team(p) {
    return `
<section class="tw-bg-slate-50 dark:tw-bg-slate-950 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
    <div class="tw-mt-12 tw-grid sm:tw-grid-cols-2 lg:tw-grid-cols-4 tw-gap-8">
      ${(p.members || [])
        .map(
          (m) => `
      <div class="tw-text-center">
        <div class="tw-mx-auto tw-h-28 tw-w-28 tw-rounded-full tw-overflow-hidden tw-bg-slate-200 dark:tw-bg-slate-800">
          ${m.photoUrl ? `<img src="${escapeHtml(m.photoUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" />` : ""}
        </div>
        <h3 class="tw-mt-4 tw-font-semibold tw-text-slate-900 dark:tw-text-white">${escapeHtml(m.name)}</h3>
        <p class="tw-text-sm tw-text-[var(--theme-primary,#6D28D9)]">${escapeHtml(m.role)}</p>
        ${m.bio ? `<p class="tw-mt-2 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(m.bio)}</p>` : ""}
      </div>`
        )
        .join("\n")}
    </div>
  </div>
</section>`;
  },

  Blog(p) {
    return `
<section class="tw-bg-white dark:tw-bg-slate-900 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
    <div class="tw-mt-12 tw-grid sm:tw-grid-cols-2 lg:tw-grid-cols-3 tw-gap-8">
      ${(p.posts || [])
        .map(
          (post) => `
      <a href="${escapeHtml(post.link || "#")}" class="tw-block tw-rounded-2xl tw-overflow-hidden tw-border tw-border-slate-100 dark:tw-border-slate-800 hover:tw-shadow-lg tw-transition">
        <div class="tw-aspect-video tw-bg-slate-100 dark:tw-bg-slate-800">${post.imageUrl ? `<img src="${escapeHtml(post.imageUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" />` : ""}</div>
        <div class="tw-p-5">
          ${post.date ? `<span class="tw-text-xs tw-uppercase tw-tracking-wide tw-text-[var(--theme-accent,#F59E0B)]">${escapeHtml(post.date)}</span>` : ""}
          <h3 class="tw-mt-2 tw-font-semibold tw-text-slate-900 dark:tw-text-white">${escapeHtml(post.title)}</h3>
          ${post.excerpt ? `<p class="tw-mt-2 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(post.excerpt)}</p>` : ""}
        </div>
      </a>`
        )
        .join("\n")}
    </div>
  </div>
</section>`;
  },

  Portfolio(p) {
    return `
<section class="tw-bg-slate-50 dark:tw-bg-slate-950 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
    <div class="tw-mt-12 tw-grid sm:tw-grid-cols-2 lg:tw-grid-cols-3 tw-gap-6">
      ${(p.items || [])
        .map(
          (item) => `
      <a href="${escapeHtml(item.link || "#")}" class="tw-group tw-relative tw-block tw-aspect-square tw-rounded-xl tw-overflow-hidden tw-bg-slate-200 dark:tw-bg-slate-800">
        ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover tw-transition group-hover:tw-scale-105" loading="lazy" />` : ""}
        <div class="tw-absolute tw-inset-0 tw-bg-gradient-to-t tw-from-black/70 tw-via-transparent tw-to-transparent tw-flex tw-items-end tw-p-4">
          <div>
            <p class="tw-text-white tw-font-semibold">${escapeHtml(item.title)}</p>
            ${item.category ? `<p class="tw-text-white/70 tw-text-xs">${escapeHtml(item.category)}</p>` : ""}
          </div>
        </div>
      </a>`
        )
        .join("\n")}
    </div>
  </div>
</section>`;
  },

  Video(p) {
    return `
<section class="tw-bg-white dark:tw-bg-slate-900 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-4xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto tw-mb-10">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
    <div class="tw-aspect-video tw-rounded-2xl tw-overflow-hidden tw-bg-slate-900 tw-relative">
      ${p.videoUrl ? `<iframe src="${escapeHtml(p.videoUrl)}" class="tw-h-full tw-w-full tw-border-0" allowfullscreen loading="lazy"></iframe>` : p.posterUrl ? `<img src="${escapeHtml(p.posterUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" />` : ""}
    </div>
  </div>
</section>`;
  },

  Map(p) {
    return `
<section class="tw-bg-slate-50 dark:tw-bg-slate-950 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-5xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto tw-mb-8">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
      ${p.address ? `<p class="tw-mt-2 tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">${escapeHtml(p.address)}</p>` : ""}
    </div>
    <div class="tw-aspect-[21/9] tw-rounded-2xl tw-overflow-hidden tw-bg-slate-200 dark:tw-bg-slate-800">
      ${p.mapEmbedUrl ? `<iframe src="${escapeHtml(p.mapEmbedUrl)}" class="tw-h-full tw-w-full tw-border-0" loading="lazy"></iframe>` : ""}
    </div>
  </div>
</section>`;
  },

  Newsletter(p) {
    return `
<section class="tw-bg-[var(--theme-primary,#6D28D9)] tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-2xl tw-px-6 tw-text-center">
    ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
    ${p.subtitle ? `<p class="tw-mt-3 tw-text-white/80">${escapeHtml(p.subtitle)}</p>` : ""}
    <form class="tw-mt-8 tw-flex tw-flex-col sm:tw-flex-row tw-gap-3 tw-max-w-md tw-mx-auto">
      <input type="email" placeholder="${escapeHtml(p.placeholder)}" class="tw-flex-1 tw-rounded-full tw-px-5 tw-py-3 tw-text-sm tw-border-0 focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-white" />
      <button type="submit" class="tw-rounded-full tw-bg-white tw-px-6 tw-py-3 tw-text-sm tw-font-medium tw-text-[var(--theme-primary,#6D28D9)] hover:tw-bg-slate-100 tw-transition">${escapeHtml(p.ctaLabel)}</button>
    </form>
  </div>
</section>`;
  },

  ImageGrid(p) {
    const colClass = { 2: "sm:tw-grid-cols-2", 3: "sm:tw-grid-cols-3", 4: "sm:tw-grid-cols-4" };
    return `
<section class="tw-bg-white dark:tw-bg-slate-900 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6">
    ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-center tw-text-slate-900 dark:tw-text-white tw-mb-10">${escapeHtml(p.title)}</h2>` : ""}
    <div class="tw-grid tw-grid-cols-2 ${colClass[p.columns] || colClass[3]}">
      ${(p.images || [])
        .map(
          (img) => `<div class="tw-aspect-square tw-bg-slate-100 dark:tw-bg-slate-800 tw-overflow-hidden">${img.url ? `<img src="${escapeHtml(img.url)}" alt="" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" />` : ""}</div>`
        )
        .join("\n")}
    </div>
  </div>
</section>`;
  },

  Cards(p) {
    const cards = p.cards || [];
    let body;
    if (p.variant === "horizontal") {
      body = `
    <div class="tw-mt-12 tw-space-y-6">
      ${cards
        .map(
          (card) => `
      <div class="tw-flex tw-flex-col sm:tw-flex-row tw-overflow-hidden tw-rounded-2xl tw-bg-white dark:tw-bg-slate-900 tw-border tw-border-slate-100 dark:tw-border-slate-800 tw-shadow-sm">
        ${card.imageUrl ? `<div class="sm:tw-w-56 tw-aspect-video sm:tw-aspect-auto tw-bg-slate-100 dark:tw-bg-slate-800 tw-shrink-0"><img src="${escapeHtml(card.imageUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" /></div>` : ""}
        <div class="tw-p-6">
          <h3 class="tw-font-semibold tw-text-slate-900 dark:tw-text-white">${escapeHtml(card.title)}</h3>
          ${card.body ? `<p class="tw-mt-2 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(card.body)}</p>` : ""}
          ${card.link ? `<a href="${escapeHtml(card.link)}" class="tw-mt-4 tw-inline-block tw-text-sm tw-font-medium tw-text-[var(--theme-primary,#6D28D9)] hover:tw-underline">Learn more →</a>` : ""}
        </div>
      </div>`
        )
        .join("\n")}
    </div>`;
    } else if (p.variant === "overlay") {
      body = `
    <div class="tw-mt-12 tw-grid sm:tw-grid-cols-2 lg:tw-grid-cols-3 tw-gap-6">
      ${cards
        .map(
          (card) => `
      <a href="${escapeHtml(card.link || "#")}" class="tw-group tw-relative tw-block tw-aspect-square tw-rounded-2xl tw-overflow-hidden tw-bg-slate-200 dark:tw-bg-slate-800">
        ${card.imageUrl ? `<img src="${escapeHtml(card.imageUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover tw-transition group-hover:tw-scale-105" loading="lazy" />` : ""}
        <div class="tw-absolute tw-inset-0 tw-bg-gradient-to-t tw-from-black/70 tw-via-transparent tw-to-transparent tw-flex tw-items-end tw-p-4">
          <div>
            <p class="tw-text-white tw-font-semibold">${escapeHtml(card.title)}</p>
            ${card.body ? `<p class="tw-text-white/70 tw-text-xs">${escapeHtml(card.body)}</p>` : ""}
          </div>
        </div>
      </a>`
        )
        .join("\n")}
    </div>`;
    } else if (p.variant === "compact") {
      body = `
    <div class="tw-mt-12 tw-grid tw-grid-cols-2 sm:tw-grid-cols-3 lg:tw-grid-cols-4 tw-gap-4">
      ${cards
        .map(
          (card) => `
      <a href="${escapeHtml(card.link || "#")}" class="tw-rounded-xl tw-bg-white dark:tw-bg-slate-900 tw-border tw-border-slate-100 dark:tw-border-slate-800 tw-p-4 tw-text-center hover:tw-shadow-md tw-transition">
        ${card.imageUrl ? `<div class="tw-mx-auto tw-h-14 tw-w-14 tw-rounded-full tw-overflow-hidden tw-bg-slate-100 dark:tw-bg-slate-800 tw-mb-2"><img src="${escapeHtml(card.imageUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" /></div>` : ""}
        <p class="tw-text-sm tw-font-medium tw-text-slate-900 dark:tw-text-white">${escapeHtml(card.title)}</p>
      </a>`
        )
        .join("\n")}
    </div>`;
    } else {
      body = `
    <div class="tw-mt-12 tw-grid sm:tw-grid-cols-2 lg:tw-grid-cols-3 tw-gap-6">
      ${cards
        .map(
          (card) => `
      <div class="tw-rounded-2xl tw-overflow-hidden tw-bg-white dark:tw-bg-slate-900 tw-border tw-border-slate-100 dark:tw-border-slate-800 tw-shadow-sm">
        ${card.imageUrl ? `<div class="tw-aspect-video tw-bg-slate-100 dark:tw-bg-slate-800"><img src="${escapeHtml(card.imageUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" /></div>` : ""}
        <div class="tw-p-6">
          <h3 class="tw-font-semibold tw-text-slate-900 dark:tw-text-white">${escapeHtml(card.title)}</h3>
          ${card.body ? `<p class="tw-mt-2 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(card.body)}</p>` : ""}
          ${card.link ? `<a href="${escapeHtml(card.link)}" class="tw-mt-4 tw-inline-block tw-text-sm tw-font-medium tw-text-[var(--theme-primary,#6D28D9)] hover:tw-underline">Learn more →</a>` : ""}
        </div>
      </div>`
        )
        .join("\n")}
    </div>`;
    }
    return `
<section class="tw-bg-slate-50 dark:tw-bg-slate-950 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
    ${body}
  </div>
</section>`;
  },

  Statistics(p) {
    return `
<section class="tw-bg-[var(--theme-primary,#6D28D9)] tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6">
    ${
      p.title || p.subtitle
        ? `<div class="tw-text-center tw-max-w-2xl tw-mx-auto tw-mb-12">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-white/80">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>`
        : ""
    }
    <div class="tw-grid tw-grid-cols-2 md:tw-grid-cols-4 tw-gap-8 tw-text-center">
      ${(p.stats || [])
        .map((s) => `<div><div class="tw-text-4xl tw-font-extrabold tw-text-white">${escapeHtml(s.value)}</div><div class="tw-mt-2 tw-text-sm tw-text-white/70">${escapeHtml(s.label)}</div></div>`)
        .join("\n")}
    </div>
  </div>
</section>`;
  },

  MenuShowcase(p) {
    const variant = p.variant || "list";
    return `
<section class="tw-bg-white dark:tw-bg-slate-900 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
    <div class="tw-mt-12 tw-space-y-12">
      ${(p.categories || [])
        .map(
          (cat) => `
      <div>
        <h3 class="tw-text-xl tw-font-semibold tw-text-[var(--theme-accent,#F59E0B)] tw-mb-6">${escapeHtml(cat.name)}</h3>
        ${
          variant === "grid"
            ? `<div class="tw-grid sm:tw-grid-cols-2 lg:tw-grid-cols-3 tw-gap-6">
          ${(cat.items || [])
            .map(
              (item) => `
          <div class="tw-rounded-2xl tw-overflow-hidden tw-bg-slate-50 dark:tw-bg-slate-800 tw-border tw-border-slate-100 dark:tw-border-slate-700">
            ${item.imageUrl ? `<div class="tw-aspect-video tw-bg-slate-100 dark:tw-bg-slate-700"><img src="${escapeHtml(item.imageUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" /></div>` : ""}
            <div class="tw-p-4">
              <div class="tw-flex tw-items-baseline tw-justify-between tw-gap-2">
                <h4 class="tw-font-medium tw-text-slate-900 dark:tw-text-white">${item.isVeg === true ? `<span class="tw-inline-block tw-h-2.5 tw-w-2.5 tw-rounded-full tw-bg-green-600 tw-mr-1.5"></span>` : item.isVeg === false ? `<span class="tw-inline-block tw-h-2.5 tw-w-2.5 tw-rounded-full tw-bg-red-600 tw-mr-1.5"></span>` : ""}${escapeHtml(item.name)}</h4>
                ${item.price ? `<span class="tw-font-semibold tw-text-[var(--theme-primary,#6D28D9)] tw-whitespace-nowrap">₹${escapeHtml(item.price)}</span>` : ""}
              </div>
              ${item.description ? `<p class="tw-mt-1 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(item.description)}</p>` : ""}
            </div>
          </div>`
            )
            .join("\n")}
        </div>`
            : `<div class="tw-grid sm:tw-grid-cols-2 tw-gap-6">
          ${(cat.items || [])
            .map(
              (item) => `
          <div class="tw-flex tw-gap-4">
            ${item.imageUrl ? `<div class="tw-h-16 tw-w-16 tw-shrink-0 tw-rounded-lg tw-overflow-hidden tw-bg-slate-100 dark:tw-bg-slate-800"><img src="${escapeHtml(item.imageUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" /></div>` : ""}
            <div class="tw-flex-1">
              <div class="tw-flex tw-items-baseline tw-justify-between tw-gap-4">
                <h4 class="tw-font-medium tw-text-slate-900 dark:tw-text-white">${escapeHtml(item.name)}</h4>
                ${item.price ? `<span class="tw-font-semibold tw-text-[var(--theme-primary,#6D28D9)] tw-whitespace-nowrap">₹${escapeHtml(item.price)}</span>` : ""}
              </div>
              ${item.description ? `<p class="tw-mt-1 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(item.description)}</p>` : ""}
            </div>
          </div>`
            )
            .join("\n")}
        </div>`
        }
      </div>`
        )
        .join("\n")}
      ${!(p.categories || []).length ? `<p class="tw-text-center tw-text-sm tw-text-slate-400">No menu items to show yet.</p>` : ""}
    </div>
  </div>
</section>`;
  },

  ComboShowcase(p) {
    return `
<section class="tw-bg-slate-50 dark:tw-bg-slate-950 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
    <div class="tw-mt-12 tw-grid sm:tw-grid-cols-2 lg:tw-grid-cols-3 tw-gap-6">
      ${(p.combos || [])
        .map(
          (combo) => `
      <div class="tw-rounded-2xl tw-overflow-hidden tw-bg-white dark:tw-bg-slate-900 tw-border tw-border-slate-100 dark:tw-border-slate-800 tw-shadow-sm">
        ${combo.imageUrl ? `<div class="tw-aspect-video tw-bg-slate-100 dark:tw-bg-slate-800"><img src="${escapeHtml(combo.imageUrl)}" alt="" class="tw-h-full tw-w-full tw-object-cover" loading="lazy" /></div>` : ""}
        <div class="tw-p-5">
          <div class="tw-flex tw-items-baseline tw-justify-between tw-gap-2">
            <h3 class="tw-font-semibold tw-text-slate-900 dark:tw-text-white">${escapeHtml(combo.name)}</h3>
            ${combo.price ? `<span class="tw-font-semibold tw-text-[var(--theme-primary,#6D28D9)] tw-whitespace-nowrap">₹${escapeHtml(combo.price)}</span>` : ""}
          </div>
          ${combo.description ? `<p class="tw-mt-2 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(combo.description)}</p>` : ""}
          ${
            (combo.includes || []).length
              ? `<ul class="tw-mt-3 tw-space-y-1 tw-text-xs tw-text-slate-500 dark:tw-text-slate-400">${combo.includes.map((inc) => `<li class="tw-flex tw-gap-1.5"><i class="mdi mdi-check tw-text-[var(--theme-primary,#6D28D9)]"></i>${escapeHtml(inc.value)}</li>`).join("")}</ul>`
              : ""
          }
        </div>
      </div>`
        )
        .join("\n")}
    </div>
  </div>
</section>`;
  },

  OpeningHours(p) {
    return `
<section class="tw-bg-slate-50 dark:tw-bg-slate-950 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-3xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto tw-mb-8">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
    <div class="tw-space-y-4">
      ${(p.branches || [])
        .map(
          (branch) => `
      <div class="tw-rounded-xl tw-bg-white dark:tw-bg-slate-900 tw-border tw-border-slate-200 dark:tw-border-slate-800 tw-p-4 tw-flex tw-items-center tw-justify-between tw-gap-4">
        <div>
          <h3 class="tw-font-medium tw-text-slate-900 dark:tw-text-white">${escapeHtml(branch.name)}</h3>
          ${branch.address ? `<p class="tw-text-sm tw-text-slate-500 dark:tw-text-slate-400">${escapeHtml(branch.address)}</p>` : ""}
        </div>
        ${branch.openingTime || branch.closingTime ? `<div class="tw-text-sm tw-font-medium tw-text-[var(--theme-primary,#6D28D9)] tw-whitespace-nowrap">${escapeHtml(branch.openingTime)}${branch.openingTime && branch.closingTime ? " - " : ""}${escapeHtml(branch.closingTime)}</div>` : ""}
      </div>`
        )
        .join("\n")}
      ${!(p.branches || []).length ? `<p class="tw-text-center tw-text-sm tw-text-slate-400">No branches to show yet.</p>` : ""}
    </div>
  </div>
</section>`;
  },

  BranchLocator(p) {
    return `
<section class="tw-bg-white dark:tw-bg-slate-900 tw-py-16"${bgAttr(p)}>
  <div class="tw-mx-auto tw-max-w-5xl tw-px-6">
    <div class="tw-text-center tw-max-w-2xl tw-mx-auto tw-mb-10">
      ${p.title ? `<h2 class="tw-text-3xl tw-font-bold tw-text-slate-900 dark:tw-text-white">${escapeHtml(p.title)}</h2>` : ""}
      ${p.subtitle ? `<p class="tw-mt-3 tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(p.subtitle)}</p>` : ""}
    </div>
    <div class="tw-grid sm:tw-grid-cols-2 lg:tw-grid-cols-3 tw-gap-6">
      ${(p.branches || [])
        .map(
          (branch) => `
      <div class="tw-rounded-2xl tw-bg-slate-50 dark:tw-bg-slate-800 tw-border tw-border-slate-100 dark:tw-border-slate-700 tw-p-5">
        <h3 class="tw-font-semibold tw-text-slate-900 dark:tw-text-white">${escapeHtml(branch.name)}</h3>
        ${branch.address ? `<p class="tw-mt-1 tw-text-sm tw-text-slate-600 dark:tw-text-slate-300">${escapeHtml(branch.address)}</p>` : ""}
        ${branch.openingTime || branch.closingTime ? `<p class="tw-mt-2 tw-text-xs tw-text-slate-500 dark:tw-text-slate-400">${escapeHtml(branch.openingTime)}${branch.openingTime && branch.closingTime ? " - " : ""}${escapeHtml(branch.closingTime)}</p>` : ""}
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.name || ""} ${branch.address || ""}`.trim())}" target="_blank" rel="noopener" class="tw-mt-3 tw-inline-flex tw-items-center tw-gap-1 tw-text-sm tw-font-medium tw-text-[var(--theme-primary,#6D28D9)] hover:tw-underline">
          <i class="mdi mdi-directions"></i>Get Directions
        </a>
      </div>`
        )
        .join("\n")}
      ${!(p.branches || []).length ? `<p class="tw-text-center tw-text-sm tw-text-slate-400 sm:tw-col-span-2 lg:tw-col-span-3">No branches to show yet.</p>` : ""}
    </div>
  </div>
</section>`;
  },

  AnnouncementBar(p) {
    if (!p.message) return "";
    const dismissible = p.dismissible === true || p.dismissible === "true";
    const bg = p.bgColor || "var(--theme-primary,#6D28D9)";
    // Static export has no Vue runtime to hook a dismiss handler into - this
    // tiny inline script (not a bundle/tree-shaking concern, just a few
    // lines) is the one deliberate exception to "no client JS" in this
    // module, since a persisted dismiss inherently needs some client state.
    const id = `ann-${Math.random().toString(36).slice(2, 8)}`;
    return `
<div id="${id}" class="tw-w-full tw-py-2 tw-px-4 tw-text-center tw-text-sm tw-text-white tw-flex tw-items-center tw-justify-center tw-gap-3" style="background-color:${escapeHtml(bg)}">
  <span>${escapeHtml(p.message)}</span>
  ${p.linkLabel ? `<a href="${escapeHtml(p.linkUrl)}" class="tw-underline tw-font-medium">${escapeHtml(p.linkLabel)}</a>` : ""}
  ${dismissible ? `<button type="button" class="tw-ml-2 tw-opacity-80 hover:tw-opacity-100" onclick="document.getElementById('${id}').style.display='none';localStorage.setItem('wb-announcement-dismissed:${escapeHtml(p.message).replace(/'/g, "")}','1')"><i class="mdi mdi-close"></i></button>` : ""}
</div>
${
  dismissible
    ? `<script>(function(){try{if(localStorage.getItem('wb-announcement-dismissed:${escapeHtml(p.message).replace(/'/g, "")}')==='1'){var el=document.getElementById('${id}');if(el)el.style.display='none';}}catch(e){}})();</` +
      `script>`
    : ""
}`;
  },

  CookieBanner(p) {
    const id = "cookie-banner";
    return `
<div id="${id}" class="tw-fixed tw-bottom-0 tw-inset-x-0 tw-z-40 tw-bg-slate-900 tw-text-white tw-p-4 tw-flex tw-flex-col sm:tw-flex-row tw-items-center tw-justify-center tw-gap-4 tw-text-sm" style="display:none">
  <span>${escapeHtml(p.message)}</span>
  <button type="button" class="tw-rounded-full tw-bg-[var(--theme-primary,#6D28D9)] tw-px-4 tw-py-1.5 tw-font-medium tw-whitespace-nowrap" onclick="document.getElementById('${id}').style.display='none';localStorage.setItem('wb-cookie-consent-accepted','1')">${escapeHtml(p.acceptLabel)}</button>
</div>
<script>(function(){try{if(localStorage.getItem('wb-cookie-consent-accepted')!=='1'){var el=document.getElementById('${id}');if(el)el.style.display='flex';}}catch(e){}})();</` + `script>`;
  },

  Breadcrumb(p) {
    if (!p.currentLabel) return "";
    return `
<nav class="tw-bg-slate-50 dark:tw-bg-slate-950 tw-py-3 tw-text-sm">
  <div class="tw-mx-auto tw-max-w-6xl tw-px-6 tw-flex tw-items-center tw-gap-2 tw-text-slate-500 dark:tw-text-slate-400">
    <a href="${escapeHtml(p.homeHref || "/")}" class="hover:tw-text-[var(--theme-primary,#6D28D9)]">${escapeHtml(p.homeLabel || "Home")}</a>
    <i class="mdi mdi-chevron-right tw-text-xs"></i>
    <span class="tw-text-slate-900 dark:tw-text-white tw-font-medium">${escapeHtml(p.currentLabel)}</span>
  </div>
</nav>`;
  },

  FloatingWhatsApp(p) {
    if (!p.phone) return "";
    const digits = String(p.phone).replace(/[^0-9]/g, "");
    const q = p.message ? `?text=${encodeURIComponent(p.message)}` : "";
    return `
<a href="https://wa.me/${digits}${q}" target="_blank" rel="noopener" class="tw-fixed tw-bottom-6 tw-right-6 tw-z-40 tw-h-14 tw-w-14 tw-rounded-full tw-bg-[#25D366] tw-text-white tw-flex tw-items-center tw-justify-center tw-shadow-lg tw-text-2xl" aria-label="Chat on WhatsApp">
  <i class="mdi mdi-whatsapp"></i>
</a>`;
  },

  FloatingCallButton(p) {
    if (!p.phone) return "";
    return `
<a href="tel:${escapeHtml(p.phone)}" class="tw-fixed tw-bottom-24 tw-right-6 tw-z-40 tw-h-14 tw-w-14 tw-rounded-full tw-bg-[var(--theme-primary,#6D28D9)] tw-text-white tw-flex tw-items-center tw-justify-center tw-shadow-lg tw-text-2xl" aria-label="Call us">
  <i class="mdi mdi-phone"></i>
</a>`;
  },

  // FloatingCart/CheckoutForm/OrderConfirmation render nothing in the static
  // export, deliberately - a published static site has no Vue/Pinia runtime
  // to hold real cart state, place a real order, or open the real Razorpay
  // widget, unlike the live qsr-system-frondend site (which does render these
  // for real - see that app's own copies + useMenuCart.js/useCheckout.js).
  // Shipping an inert cart icon or a form with no working submit on a
  // published page would be actively misleading, not just incomplete, so
  // these are omitted entirely rather than rendered broken. MenuShowcase's
  // `enableCart` prop is likewise simply not read here - its Add to Cart
  // buttons only exist in the two live Vue copies.
  FloatingCart() {
    return "";
  },
  CheckoutForm() {
    return "";
  },
  OrderConfirmation() {
    return "";
  },
};

function renderBlockToHtml(type, props) {
  const renderer = renderers[type];
  if (!renderer) return "";
  return renderer(props || {});
}

module.exports = { renderBlockToHtml, escapeHtml };
