export const GAME_FIELDS =
  "fields name,url,first_release_date,genres.name,game_modes.name,multiplayer_modes.*,external_games.uid,external_games.external_game_source;";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// IGDB allows 4 requests per second; 260 ms between calls stays under it.
export function createIgdb(clientId: string, clientSecret: string, fetchFn: typeof fetch = fetch) {
  let token: string | null = null;
  let last = 0;
  return {
    async post(endpoint: string, body: string): Promise<unknown[]> {
      if (!token) {
        // Secret in the body, and fetch's own error (which quotes the request)
        // never passed on, so the secret cannot reach a log.
        let res: Response;
        try {
          res = await fetchFn("https://id.twitch.tv/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: "client_credentials",
            }).toString(),
          });
        } catch {
          throw new Error("Twitch token request failed: network error");
        }
        if (!res.ok) throw new Error(`Twitch token request failed with status ${res.status}`);
        token = (await res.json()).access_token;
      }
      const wait = 260 - (Date.now() - last);
      if (wait > 0) await sleep(wait);
      last = Date.now();
      const res = await fetchFn(`https://api.igdb.com/v4/${endpoint}`, {
        method: "POST",
        headers: { "Client-ID": clientId, Authorization: `Bearer ${token}` },
        body,
      });
      if (!res.ok) throw new Error(`IGDB ${endpoint} failed with status ${res.status}`);
      return await res.json();
    },
  };
}
