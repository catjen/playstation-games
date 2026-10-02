import { assertEquals, assertRejects } from "@std/assert";
import { createIgdb } from "./igdb_client.ts";

const SECRET = "s3cr3t-value";

Deno.test("the client secret goes in the request body, not the URL", async () => {
  const seen: { url: string; body: string }[] = [];
  const fake = (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), body: String(init?.body ?? "") });
    const json = String(input).includes("twitch") ? { access_token: "t" } : [];
    return Promise.resolve(new Response(JSON.stringify(json)));
  };
  await createIgdb("id", SECRET, fake as typeof fetch).post("games", "fields name;");
  assertEquals(seen[0].url.includes(SECRET), false);
  assertEquals(seen[0].body.includes(`client_secret=${SECRET}`), true);
});

Deno.test("a network error on the token request does not repeat the secret", async () => {
  const fake = (input: string | URL | Request, init?: RequestInit) =>
    Promise.reject(new TypeError(`error sending request for url (${String(input)}) body ${String(init?.body)}`));
  const err = await assertRejects(() => createIgdb("id", SECRET, fake as typeof fetch).post("games", "x"));
  assertEquals(String((err as Error).message).includes(SECRET), false);
});
