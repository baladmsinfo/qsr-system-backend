import { generateLicenseKey } from "../utils/licenseKey.js";

export async function create_license(prisma, data) {
  const { companyID, planCode, expiresAt } = data;

  let getPlan = await prisma.plan.findUnique({
    where: { code: planCode },
  });

  if (!getPlan) {
    getPlan = await prisma.plan.create({
      data: {
        name: "Basic",
        code: planCode,
        branch: 1,
      },
    });
  }

  const license = await prisma.license.create({
    data: {
      licenseKey: generateLicenseKey(),
      companyID,
      planId: getPlan.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return license;
}