import { assertEquals } from "@std/assert";
import { commitMessage } from "./summary.ts";

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
