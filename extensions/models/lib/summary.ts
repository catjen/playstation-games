const games = (n: number) => `${n} game${n === 1 ? "" : "s"}`;

export function commitMessage(added: number, updated: number, gone: number): string | null {
  const parts: string[] = [];
  if (added) parts.push(`Add ${games(added)}`);
  if (updated) parts.push(parts.length ? `update ${updated}` : `Update ${games(updated)}`);
  if (gone) parts.push(parts.length ? `mark ${gone} gone` : `Mark ${games(gone)} gone`);
  return parts.length ? parts.join(", ") : null;
}
