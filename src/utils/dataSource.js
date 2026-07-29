// Resolves a block's reserved `_dataSource` prop against already-fetched live
// data (the branch's menu / the company's branch list) into the SAME prop
// shape every block already expects statically - mirrors
// qsr-system-admin/frontend's builder-blocks/dataSource.js exactly (same
// "copy both ways" convention as every other shared helper this module
// uses). Used by staticSiteGenerator.js, which queries Prisma directly for
// the branch's menu instead of calling the public HTTP route (this runs
// inside the backend that already owns that data).

function filterMenuItems(items, filter) {
  if (filter === "recommended") return items.filter((i) => i.isRecommended);
  if (filter === "popular") return items.filter((i) => i.isPopular);
  return items;
}

// menuCategories: MenuCategory rows with menuItems/subCategories included,
// same shape routes/public.js's branch menu route already returns.
function mapMenuCategories(menuCategories, categoryId, filter) {
  const categories = categoryId ? menuCategories.filter((c) => c.id === categoryId) : menuCategories;
  return categories.map((c) => ({
    name: c.name,
    items: filterMenuItems([...(c.menuItems || []), ...(c.subCategories || []).flatMap((sc) => sc.menuItems || [])], filter).map((i) => ({
      // id/taxRate kept for parity with the frontend copies even though the
      // static export never runs a real cart (see blockTemplates.js's
      // MenuShowcase - enableCart renders no interactive markup there).
      id: i.id,
      taxRate: i.taxRate,
      name: i.name,
      description: i.description || "",
      price: i.price != null ? String(i.price) : "",
      imageUrl: i.imageUrl || "",
      isVeg: i.isVeg,
      tags: i.tags || [],
    })),
  }));
}

function mapBranches(branches) {
  return (branches || []).map((b) => ({
    name: b.name,
    address: [b.addressLine1, b.city].filter(Boolean).join(", "),
    openingTime: b.openingTime || "",
    closingTime: b.closingTime || "",
  }));
}

function resolveBlockDataSource(block, liveData) {
  const ds = block.props?._dataSource;
  if (!ds || ds.mode !== "dynamic") return block;

  if (block.type === "MenuShowcase" && liveData?.menuCategories) {
    return { ...block, props: { ...block.props, categories: mapMenuCategories(liveData.menuCategories, ds.categoryId, block.props.filter) } };
  }
  if ((block.type === "OpeningHours" || block.type === "BranchLocator") && liveData?.branches) {
    return { ...block, props: { ...block.props, branches: mapBranches(liveData.branches) } };
  }
  return block;
}

module.exports = { resolveBlockDataSource, mapMenuCategories, mapBranches };
