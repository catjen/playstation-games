import { assertEquals } from "@std/assert";
import { commitMessage, newGamesMail } from "./summary.ts";

Deno.test("no changes means no commit", () => {
  assertEquals(commitMessage(0, 0, 0), null);
});

Deno.test("one added game is singular", () => {
  assertEquals(commitMessage(1, 0, 0), "Add 1 game");
});

Deno.test("all three kinds of change are listed", () => {
  assertEquals(commitMessage(3, 1, 2), "Add 3 games, update 1, mark 2 gone");
});

Deno.test("updates alone are described", () => {
  assertEquals(commitMessage(0, 4, 0), "Update 4 games");
});

Deno.test("the new-games mail names each added game and opens with the site link", () => {
  const m = newGamesMail(["Dead Island 2", "Tomb Raider"]);
  assertEquals(m?.subject, "Game list: 2 new games");
  assertEquals(m?.body.startsWith("https://catjen.github.io/playstation-games/\n"), true);
  assertEquals(m?.body.endsWith("Dead Island 2\nTomb Raider"), true);
});

Deno.test("one new game is singular", () => {
  assertEquals(newGamesMail(["Tomb Raider"])?.subject, "Game list: 1 new game");
});

Deno.test("no new games means no mail", () => {
  assertEquals(newGamesMail([]), null);
});
