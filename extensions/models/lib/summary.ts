const games = (n: number) => `${n} game${n === 1 ? "" : "s"}`;

export function commitMessage(added: number, updated: number, gone: number): string | null {
  const parts: string[] = [];
  if (added) parts.push(`Add ${games(added)}`);
  if (updated) parts.push(parts.length ? `update ${updated}` : `Update ${games(updated)}`);
  if (gone) parts.push(parts.length ? `mark ${gone} gone` : `Mark ${games(gone)} gone`);
  return parts.length ? parts.join(", ") : null;
}

export const SITE = "https://catjen.github.io/playstation-games/";

export function newGamesMail(titles: string[]): { subject: string; body: string } | null {
  if (titles.length === 0) return null;
  return {
    subject: `Game list: ${titles.length} new ${titles.length === 1 ? "game" : "games"}`,
    body: [`${SITE}\nThe game list, with the games added since last time.`, "New since last time:", titles.join("\n")]
      .join("\n\n"),
  };
}
