// Compiles the static-site CSS shipped with every published website. This
// config is deliberately separate from the admin/frontend apps' own
// tailwind.config.js - it scans blockTemplates.js (the plain-JS port of the
// 20 builder blocks used only by the publish pipeline), not any .vue file,
// and has no reason to change unless a new block type is added. Compiled
// once via `npm run build:static-css`, not regenerated per publish.
module.exports = {
  prefix: "tw-",
  corePlugins: {
    preflight: false,
  },
  darkMode: "class",
  content: ["./src/services/blockTemplates.js"],
  theme: {
    extend: {},
  },
  plugins: [],
};
