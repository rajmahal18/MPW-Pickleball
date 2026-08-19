import { readFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import { storedImagePathFromUrl } from "../lib/avatar-storage";
import { extractTeamBranding } from "../lib/team-branding-server";

async function main() {
  const teams = await prisma.team.findMany({
    where: { logoUrl: { not: null }, brandingPrimary: null },
    select: { id: true, name: true, logoUrl: true },
  });
  let updated = 0;
  for (const team of teams) {
    const filePath = team.logoUrl ? storedImagePathFromUrl(team.logoUrl) : null;
    if (!filePath) { console.warn(`Skipped ${team.name}: logo is not in managed storage.`); continue; }
    try {
      const palette = await extractTeamBranding(await readFile(filePath));
      await prisma.team.update({ where: { id: team.id }, data: palette });
      updated += 1;
    } catch (error) {
      console.warn(`Skipped ${team.name}: ${error instanceof Error ? error.message : "extraction failed"}`);
    }
  }
  console.log(`Generated branding for ${updated} of ${teams.length} eligible teams.`);
}

main().finally(() => prisma.$disconnect());
