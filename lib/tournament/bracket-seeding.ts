export type QualificationSource =
  | { type: "GROUP"; groupId: string; rank: number }
  | { type: "WILDCARD"; rank: number };

export type QualificationSourceOption = { value: string; label: string };

export function isEarlyQualificationPreview(
  matchup: { stage: string; homeQualificationSource?: string | null; awayQualificationSource?: string | null },
  groupStageComplete: boolean,
) {
  return matchup.stage === "QUARTERFINAL"
    && !groupStageComplete
    && Boolean(matchup.homeQualificationSource || matchup.awayQualificationSource);
}

function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

export function groupQualificationSource(groupId: string, rank: number) {
  return `GROUP:${groupId}:${rank}`;
}

export function wildcardQualificationSource(rank: number) {
  return `WILDCARD:${rank}`;
}

export function parseQualificationSource(value: string | null | undefined): QualificationSource | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts[0] === "GROUP" && parts.length === 3) {
    const rank = Number(parts[2]);
    if (parts[1] && Number.isInteger(rank) && rank > 0) return { type: "GROUP", groupId: parts[1], rank };
  }
  if (parts[0] === "WILDCARD" && parts.length === 2) {
    const rank = Number(parts[1]);
    if (Number.isInteger(rank) && rank > 0) return { type: "WILDCARD", rank };
  }
  return null;
}

export function qualificationSourceOptions(
  groups: Array<{ id: string; name: string }>,
  qualifiersPerGroup: number,
  wildcardCount: number,
): QualificationSourceOption[] {
  const options: QualificationSourceOption[] = [];
  for (const group of groups) {
    for (let rank = 1; rank <= Math.max(0, qualifiersPerGroup); rank += 1) {
      options.push({ value: groupQualificationSource(group.id, rank), label: `${group.name} · ${ordinal(rank)} seed` });
    }
  }
  for (let rank = 1; rank <= Math.max(0, wildcardCount); rank += 1) {
    options.push({ value: wildcardQualificationSource(rank), label: `Wildcard · ${ordinal(rank)} seed` });
  }
  return options;
}

export function resolveQualificationSource<T extends { team: { id: string }; rank: number }>(
  sourceValue: string | null | undefined,
  groupTables: Array<{ groupId: string; rows: T[] }>,
  wildcards: T[],
) {
  const source = parseQualificationSource(sourceValue);
  if (!source) return null;
  if (source.type === "WILDCARD") return wildcards[source.rank - 1]?.team.id ?? null;
  const table = groupTables.find((entry) => entry.groupId === source.groupId)?.rows ?? [];
  const row = table.find((entry) => entry.rank === source.rank) ?? table[source.rank - 1];
  return row?.team.id ?? null;
}
