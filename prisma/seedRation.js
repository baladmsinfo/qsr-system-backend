import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ✅ UPDATE THIS WITH YOUR ACTUAL COMPANY ID
const COMPANY_ID = "1e1e7840-c90b-42e3-8e07-4632499f2678";

async function main() {
  console.log("🌱 Starting ration shop seed...");

  // ─────────────────────────────────────────────
  // CATEGORIES
  // ─────────────────────────────────────────────
  const categories = await prisma.$transaction([
    prisma.category.upsert({
      where: { id: "cat-grains" },
      update: {},
      create: {
        id: "cat-grains",
        name: "Grains & Cereals",
        description: "Rice, wheat, millets and other grains distributed through ration",
        companyId: COMPANY_ID,
      },
    }),
    prisma.category.upsert({
      where: { id: "cat-pulses" },
      update: {},
      create: {
        id: "cat-pulses",
        name: "Pulses & Legumes",
        description: "Dals, lentils and dried legumes issued via PDS",
        companyId: COMPANY_ID,
      },
    }),
    prisma.category.upsert({
      where: { id: "cat-oils" },
      update: {},
      create: {
        id: "cat-oils",
        name: "Edible Oils",
        description: "Cooking oils and fats distributed under ration scheme",
        companyId: COMPANY_ID,
      },
    }),
    prisma.category.upsert({
      where: { id: "cat-sugar-salt" },
      update: {},
      create: {
        id: "cat-sugar-salt",
        name: "Sugar & Salt",
        description: "Iodised salt and sugar under PDS",
        companyId: COMPANY_ID,
      },
    }),
    prisma.category.upsert({
      where: { id: "cat-kerosene" },
      update: {},
      create: {
        id: "cat-kerosene",
        name: "Kerosene & Fuel",
        description: "Kerosene oil for cooking and lighting",
        companyId: COMPANY_ID,
      },
    }),
    prisma.category.upsert({
      where: { id: "cat-spices" },
      update: {},
      create: {
        id: "cat-spices",
        name: "Spices & Condiments",
        description: "Basic spices distributed through ration",
        companyId: COMPANY_ID,
      },
    }),
    prisma.category.upsert({
      where: { id: "cat-fortified" },
      update: {},
      create: {
        id: "cat-fortified",
        name: "Fortified & Special Items",
        description: "Fortified flour, iodised salt, and nutrition supplements",
        companyId: COMPANY_ID,
      },
    }),
  ]);

  console.log(`✅ ${categories.length} categories seeded`);

  // ─────────────────────────────────────────────
  // PRODUCTS & ITEMS
  // ─────────────────────────────────────────────

  const productDefs = [
    // ── GRAINS ──────────────────────────────────
    {
      id: "prod-rice",
      name: "Rice (Raw)",
      sku: "GRN-RICE-RAW",
      description: "Raw rice distributed under PDS scheme",
      categoryId: "cat-grains",
      items: [
        { id: "item-rice-1kg",  sku: "GRN-RICE-RAW-1KG",  variant: "1 kg"  },
        { id: "item-rice-5kg",  sku: "GRN-RICE-RAW-5KG",  variant: "5 kg"  },
        { id: "item-rice-10kg", sku: "GRN-RICE-RAW-10KG", variant: "10 kg" },
        { id: "item-rice-25kg", sku: "GRN-RICE-RAW-25KG", variant: "25 kg" },
      ],
    },
    {
      id: "prod-boiled-rice",
      name: "Rice (Boiled / Idli Rice)",
      sku: "GRN-RICE-BOIL",
      description: "Boiled / parboiled rice for idli/dosa preparation",
      categoryId: "cat-grains",
      items: [
        { id: "item-boiledrice-1kg",  sku: "GRN-RICE-BOIL-1KG",  variant: "1 kg"  },
        { id: "item-boiledrice-5kg",  sku: "GRN-RICE-BOIL-5KG",  variant: "5 kg"  },
        { id: "item-boiledrice-10kg", sku: "GRN-RICE-BOIL-10KG", variant: "10 kg" },
        { id: "item-boiledrice-25kg", sku: "GRN-RICE-BOIL-25KG", variant: "25 kg" },
      ],
    },
    {
      id: "prod-wheat",
      name: "Wheat",
      sku: "GRN-WHEAT",
      description: "Whole wheat grains under NFSA / PDS",
      categoryId: "cat-grains",
      items: [
        { id: "item-wheat-1kg",  sku: "GRN-WHEAT-1KG",  variant: "1 kg"  },
        { id: "item-wheat-5kg",  sku: "GRN-WHEAT-5KG",  variant: "5 kg"  },
        { id: "item-wheat-10kg", sku: "GRN-WHEAT-10KG", variant: "10 kg" },
        { id: "item-wheat-25kg", sku: "GRN-WHEAT-25KG", variant: "25 kg" },
      ],
    },
    {
      id: "prod-wheat-flour",
      name: "Wheat Flour (Atta)",
      sku: "GRN-ATTA",
      description: "Fortified wheat flour (atta) issued via ration",
      categoryId: "cat-grains",
      items: [
        { id: "item-atta-1kg",  sku: "GRN-ATTA-1KG",  variant: "1 kg"  },
        { id: "item-atta-5kg",  sku: "GRN-ATTA-5KG",  variant: "5 kg"  },
        { id: "item-atta-10kg", sku: "GRN-ATTA-10KG", variant: "10 kg" },
      ],
    },
    {
      id: "prod-ragi",
      name: "Ragi (Finger Millet)",
      sku: "GRN-RAGI",
      description: "Ragi grain distributed via Tamil Nadu PDS",
      categoryId: "cat-grains",
      items: [
        { id: "item-ragi-1kg", sku: "GRN-RAGI-1KG", variant: "1 kg" },
        { id: "item-ragi-5kg", sku: "GRN-RAGI-5KG", variant: "5 kg" },
      ],
    },
    {
      id: "prod-jowar",
      name: "Jowar (Sorghum)",
      sku: "GRN-JOWAR",
      description: "Jowar grain under PDS scheme",
      categoryId: "cat-grains",
      items: [
        { id: "item-jowar-1kg", sku: "GRN-JOWAR-1KG", variant: "1 kg" },
        { id: "item-jowar-5kg", sku: "GRN-JOWAR-5KG", variant: "5 kg" },
      ],
    },
    {
      id: "prod-bajra",
      name: "Bajra (Pearl Millet)",
      sku: "GRN-BAJRA",
      description: "Bajra grain distributed under ration scheme",
      categoryId: "cat-grains",
      items: [
        { id: "item-bajra-1kg", sku: "GRN-BAJRA-1KG", variant: "1 kg" },
        { id: "item-bajra-5kg", sku: "GRN-BAJRA-5KG", variant: "5 kg" },
      ],
    },
    {
      id: "prod-maize",
      name: "Maize (Corn)",
      sku: "GRN-MAIZE",
      description: "Maize grain issued under PDS",
      categoryId: "cat-grains",
      items: [
        { id: "item-maize-1kg", sku: "GRN-MAIZE-1KG", variant: "1 kg" },
        { id: "item-maize-5kg", sku: "GRN-MAIZE-5KG", variant: "5 kg" },
      ],
    },

    // ── PULSES ──────────────────────────────────
    {
      id: "prod-toor-dal",
      name: "Toor Dal (Split Pigeon Pea)",
      sku: "PLS-TOOR",
      description: "Toor dal distributed under PDS",
      categoryId: "cat-pulses",
      items: [
        { id: "item-toor-500g", sku: "PLS-TOOR-500G", variant: "500 g" },
        { id: "item-toor-1kg",  sku: "PLS-TOOR-1KG",  variant: "1 kg"  },
        { id: "item-toor-5kg",  sku: "PLS-TOOR-5KG",  variant: "5 kg"  },
      ],
    },
    {
      id: "prod-moong-dal",
      name: "Moong Dal (Split Green Gram)",
      sku: "PLS-MOONG",
      description: "Moong dal issued via ration",
      categoryId: "cat-pulses",
      items: [
        { id: "item-moong-500g", sku: "PLS-MOONG-500G", variant: "500 g" },
        { id: "item-moong-1kg",  sku: "PLS-MOONG-1KG",  variant: "1 kg"  },
        { id: "item-moong-5kg",  sku: "PLS-MOONG-5KG",  variant: "5 kg"  },
      ],
    },
    {
      id: "prod-urad-dal",
      name: "Urad Dal (Black Gram)",
      sku: "PLS-URAD",
      description: "Urad dal distributed under ration scheme",
      categoryId: "cat-pulses",
      items: [
        { id: "item-urad-500g", sku: "PLS-URAD-500G", variant: "500 g" },
        { id: "item-urad-1kg",  sku: "PLS-URAD-1KG",  variant: "1 kg"  },
        { id: "item-urad-5kg",  sku: "PLS-URAD-5KG",  variant: "5 kg"  },
      ],
    },
    {
      id: "prod-chana-dal",
      name: "Chana Dal (Split Bengal Gram)",
      sku: "PLS-CHANA",
      description: "Chana dal under PDS",
      categoryId: "cat-pulses",
      items: [
        { id: "item-chana-500g", sku: "PLS-CHANA-500G", variant: "500 g" },
        { id: "item-chana-1kg",  sku: "PLS-CHANA-1KG",  variant: "1 kg"  },
        { id: "item-chana-5kg",  sku: "PLS-CHANA-5KG",  variant: "5 kg"  },
      ],
    },
    {
      id: "prod-masoor-dal",
      name: "Masoor Dal (Red Lentil)",
      sku: "PLS-MASOOR",
      description: "Masoor dal distributed via ration",
      categoryId: "cat-pulses",
      items: [
        { id: "item-masoor-500g", sku: "PLS-MASOOR-500G", variant: "500 g" },
        { id: "item-masoor-1kg",  sku: "PLS-MASOOR-1KG",  variant: "1 kg"  },
      ],
    },
    {
      id: "prod-rajma",
      name: "Rajma (Kidney Beans)",
      sku: "PLS-RAJMA",
      description: "Rajma distributed under special ration quota",
      categoryId: "cat-pulses",
      items: [
        { id: "item-rajma-500g", sku: "PLS-RAJMA-500G", variant: "500 g" },
        { id: "item-rajma-1kg",  sku: "PLS-RAJMA-1KG",  variant: "1 kg"  },
      ],
    },
    {
      id: "prod-chana-whole",
      name: "Whole Chana (Bengal Gram)",
      sku: "PLS-CHANA-WHOLE",
      description: "Whole Bengal gram under ration",
      categoryId: "cat-pulses",
      items: [
        { id: "item-chana-whole-500g", sku: "PLS-CHANA-WHOLE-500G", variant: "500 g" },
        { id: "item-chana-whole-1kg",  sku: "PLS-CHANA-WHOLE-1KG",  variant: "1 kg"  },
        { id: "item-chana-whole-5kg",  sku: "PLS-CHANA-WHOLE-5KG",  variant: "5 kg"  },
      ],
    },

    // ── OILS ────────────────────────────────────
    {
      id: "prod-palm-oil",
      name: "Palm Oil",
      sku: "OIL-PALM",
      description: "Refined palm oil issued under PDS ration",
      categoryId: "cat-oils",
      items: [
        { id: "item-palm-500ml", sku: "OIL-PALM-500ML", variant: "500 ml"  },
        { id: "item-palm-1l",    sku: "OIL-PALM-1L",    variant: "1 Litre" },
        { id: "item-palm-5l",    sku: "OIL-PALM-5L",    variant: "5 Litre" },
      ],
    },
    {
      id: "prod-groundnut-oil",
      name: "Groundnut Oil",
      sku: "OIL-GRND",
      description: "Refined groundnut oil under ration scheme",
      categoryId: "cat-oils",
      items: [
        { id: "item-grnd-500ml", sku: "OIL-GRND-500ML", variant: "500 ml"  },
        { id: "item-grnd-1l",    sku: "OIL-GRND-1L",    variant: "1 Litre" },
        { id: "item-grnd-5l",    sku: "OIL-GRND-5L",    variant: "5 Litre" },
      ],
    },
    {
      id: "prod-sunflower-oil",
      name: "Sunflower Oil",
      sku: "OIL-SUN",
      description: "Refined sunflower oil distributed via PDS",
      categoryId: "cat-oils",
      items: [
        { id: "item-sun-500ml", sku: "OIL-SUN-500ML", variant: "500 ml"  },
        { id: "item-sun-1l",    sku: "OIL-SUN-1L",    variant: "1 Litre" },
        { id: "item-sun-5l",    sku: "OIL-SUN-5L",    variant: "5 Litre" },
      ],
    },
    {
      id: "prod-mustard-oil",
      name: "Mustard Oil",
      sku: "OIL-MUST",
      description: "Kachi ghani mustard oil under ration",
      categoryId: "cat-oils",
      items: [
        { id: "item-must-500ml", sku: "OIL-MUST-500ML", variant: "500 ml"  },
        { id: "item-must-1l",    sku: "OIL-MUST-1L",    variant: "1 Litre" },
      ],
    },

    // ── SUGAR & SALT ────────────────────────────
    {
      id: "prod-sugar",
      name: "Sugar (White)",
      sku: "SS-SUGAR",
      description: "Refined white sugar under NFSA / PDS",
      categoryId: "cat-sugar-salt",
      items: [
        { id: "item-sugar-500g", sku: "SS-SUGAR-500G", variant: "500 g" },
        { id: "item-sugar-1kg",  sku: "SS-SUGAR-1KG",  variant: "1 kg"  },
        { id: "item-sugar-5kg",  sku: "SS-SUGAR-5KG",  variant: "5 kg"  },
      ],
    },
    {
      id: "prod-iodised-salt",
      name: "Iodised Salt",
      sku: "SS-SALT-IOD",
      description: "Double-fortified iodised salt under PDS",
      categoryId: "cat-sugar-salt",
      items: [
        { id: "item-salt-500g", sku: "SS-SALT-500G", variant: "500 g" },
        { id: "item-salt-1kg",  sku: "SS-SALT-1KG",  variant: "1 kg"  },
      ],
    },
    {
      id: "prod-jaggery",
      name: "Jaggery (Vellam)",
      sku: "SS-JAGGERY",
      description: "Natural jaggery/vellam distributed under ration",
      categoryId: "cat-sugar-salt",
      items: [
        { id: "item-jagg-500g", sku: "SS-JAGG-500G", variant: "500 g" },
        { id: "item-jagg-1kg",  sku: "SS-JAGG-1KG",  variant: "1 kg"  },
      ],
    },

    // ── KEROSENE ────────────────────────────────
    {
      id: "prod-kerosene",
      name: "Kerosene Oil (PDS)",
      sku: "FUEL-KERO",
      description: "Subsidised kerosene oil for cooking and lighting",
      categoryId: "cat-kerosene",
      items: [
        { id: "item-kero-1l",  sku: "FUEL-KERO-1L",  variant: "1 Litre"  },
        { id: "item-kero-5l",  sku: "FUEL-KERO-5L",  variant: "5 Litre"  },
        { id: "item-kero-10l", sku: "FUEL-KERO-10L", variant: "10 Litre" },
      ],
    },

    // ── SPICES ──────────────────────────────────
    {
      id: "prod-red-chilli",
      name: "Red Chilli Powder",
      sku: "SPC-REDCHILLI",
      description: "Red chilli powder distributed under ration",
      categoryId: "cat-spices",
      items: [
        { id: "item-rchilli-100g", sku: "SPC-REDCHILLI-100G", variant: "100 g" },
        { id: "item-rchilli-500g", sku: "SPC-REDCHILLI-500G", variant: "500 g" },
        { id: "item-rchilli-1kg",  sku: "SPC-REDCHILLI-1KG",  variant: "1 kg"  },
      ],
    },
    {
      id: "prod-turmeric",
      name: "Turmeric Powder (Manjal)",
      sku: "SPC-TURMERIC",
      description: "Pure turmeric powder under ration scheme",
      categoryId: "cat-spices",
      items: [
        { id: "item-turm-100g", sku: "SPC-TURMERIC-100G", variant: "100 g" },
        { id: "item-turm-500g", sku: "SPC-TURMERIC-500G", variant: "500 g" },
      ],
    },
    {
      id: "prod-coriander",
      name: "Coriander Powder (Dhaniya)",
      sku: "SPC-CORIAN",
      description: "Coriander powder distributed via PDS",
      categoryId: "cat-spices",
      items: [
        { id: "item-corian-100g", sku: "SPC-CORIAN-100G", variant: "100 g" },
        { id: "item-corian-500g", sku: "SPC-CORIAN-500G", variant: "500 g" },
      ],
    },
    {
      id: "prod-pepper",
      name: "Black Pepper (Milagu)",
      sku: "SPC-PEPPER",
      description: "Whole black pepper distributed under ration",
      categoryId: "cat-spices",
      items: [
        { id: "item-pepper-100g", sku: "SPC-PEPPER-100G", variant: "100 g" },
        { id: "item-pepper-250g", sku: "SPC-PEPPER-250G", variant: "250 g" },
      ],
    },
    {
      id: "prod-tamarind",
      name: "Tamarind (Puli)",
      sku: "SPC-TAMARIND",
      description: "Tamarind block/paste distributed under ration",
      categoryId: "cat-spices",
      items: [
        { id: "item-tamarind-100g", sku: "SPC-TAMARIND-100G", variant: "100 g" },
        { id: "item-tamarind-500g", sku: "SPC-TAMARIND-500G", variant: "500 g" },
        { id: "item-tamarind-1kg",  sku: "SPC-TAMARIND-1KG",  variant: "1 kg"  },
      ],
    },

    // ── FORTIFIED / SPECIAL ──────────────────────
    {
      id: "prod-fortified-atta",
      name: "Fortified Wheat Flour (PM Garib Kalyan)",
      sku: "FORT-ATTA",
      description: "Iron & folic acid fortified atta under PM Garib Kalyan scheme",
      categoryId: "cat-fortified",
      items: [
        { id: "item-fort-atta-5kg",  sku: "FORT-ATTA-5KG",  variant: "5 kg"  },
        { id: "item-fort-atta-10kg", sku: "FORT-ATTA-10KG", variant: "10 kg" },
      ],
    },
    {
      id: "prod-iodised-fort-salt",
      name: "Double-Fortified Salt (DFS)",
      sku: "FORT-DFS",
      description: "Double-fortified iodised & iron salt",
      categoryId: "cat-fortified",
      items: [
        { id: "item-dfs-1kg", sku: "FORT-DFS-1KG", variant: "1 kg" },
      ],
    },
    {
      id: "prod-ragi-flour",
      name: "Ragi Flour (Finger Millet Flour)",
      sku: "FORT-RAGI-FL",
      description: "Ragi flour for nutrition under Tamil Nadu PDS",
      categoryId: "cat-fortified",
      items: [
        { id: "item-ragi-fl-500g", sku: "FORT-RAGI-FL-500G", variant: "500 g" },
        { id: "item-ragi-fl-1kg",  sku: "FORT-RAGI-FL-1KG",  variant: "1 kg"  },
      ],
    },
    {
      id: "prod-nutrition-mix",
      name: "Nutrition Mix (Kuzha Maavu / Sarbath)",
      sku: "FORT-NUTMIX",
      description: "Supplementary nutrition powder for children and mothers",
      categoryId: "cat-fortified",
      items: [
        { id: "item-nutmix-500g", sku: "FORT-NUTMIX-500G", variant: "500 g" },
        { id: "item-nutmix-1kg",  sku: "FORT-NUTMIX-1KG",  variant: "1 kg"  },
      ],
    },
  ];

  let productCount = 0;
  let itemCount = 0;

  for (const def of productDefs) {
    const { items, ...productData } = def;

    await prisma.product.upsert({
      where: { sku: productData.sku },
      update: {},
      create: {
        id: productData.id,
        name: productData.name,
        sku: productData.sku,
        description: productData.description,
        categoryId: productData.categoryId,
        companyId: COMPANY_ID,
      },
    });
    productCount++;

    for (const itemDef of items) {
      await prisma.item.upsert({
        where: { id: itemDef.id },
        update: {},
        create: {
          id: itemDef.id,
          productId: productData.id,
          sku: itemDef.sku,
          variant: itemDef.variant,
          price: 0,
          MRP: 0,
          companyId: COMPANY_ID,
        },
      });
      itemCount++;
    }
  }

  console.log(`✅ ${productCount} products seeded`);
  console.log(`✅ ${itemCount} items seeded`);
  console.log("🎉 Ration shop seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });