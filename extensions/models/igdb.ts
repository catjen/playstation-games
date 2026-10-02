import { z } from "npm:zod@4";
import { tooManyFailures } from "./lib/failures.ts";
import { createIgdb, GAME_FIELDS } from "./lib/igdb_client.ts";
import { mapIgdb } from "./lib/igdb_map.ts";
import { type IgdbGame, pickIgdbMatch } from "./lib/match.ts";
import {
  type IgdbDetails,
  IgdbDetailsSchema,
  type LibraryGame,
  LibraryGameSchema,
  type StoreDetails,
  StoreDetailsSchema,
} from "./lib/schemas.ts";

type Igdb = { post: (endpoint: string, body: string) => Promise<unknown[]> };
const quote = (s: string) => `"${s.replace(/["\\]/g, "")}"`;

export const model = {
  type: "@catjen/igdb",
  version: "2026.10.02.1",
  globalArguments: z.object({}),
  resources: {
    igdb: {
      description: "IGDB details for requested games",
      schema: z.object({ details: z.array(IgdbDetailsSchema) }),
      lifetime: "infinite",
      garbageCollection: 6,
    },
  },
  methods: {
    details: {
      description: "Look up co-op, versus, solo and genre details on IGDB",
      arguments: z.object({
        clientId: z.string(),
        clientSecret: z.string(),
        ids: z.array(z.string()),
        games: z.array(LibraryGameSchema),
        store: z.array(StoreDetailsSchema),
      }),
      execute: async (
        args: {
          clientId: string;
          clientSecret: string;
          ids: string[];
          games: LibraryGame[];
          store: StoreDetails[];
          _igdb?: Igdb;
        },
        // deno-lint-ignore no-explicit-any
        context: any,
      ) => {
        const igdb = args._igdb ?? createIgdb(args.clientId, args.clientSecret);
        const sources = (await igdb.post(
          "external_game_sources",
          'fields id,name; where name ~ *"PlayStation"*; limit 50;',
        )) as { id: number }[];
        const psnSourceIds = sources.map((s) => s.id);
        const gameById = new Map(args.games.map((g) => [g.id, g]));
        const yearById = new Map(args.store.map((s) => [s.id, s.releaseYear]));
        const details: IgdbDetails[] = [];
        for (const id of args.ids) {
          const g = gameById.get(id);
          if (!g) continue;
          const psnUids = [...g.productIds, ...g.titleIds, ...(g.conceptId ? [g.conceptId] : [])];
          const q = { title: g.title, releaseYear: yearById.get(id) ?? null, psnUids, psnSourceIds };
          try {
            let candidates: IgdbGame[] = [];
            if (psnSourceIds.length && psnUids.length) {
              const links = (await igdb.post(
                "external_games",
                `fields game; where uid = (${psnUids.map(quote).join(",")}) & external_game_source = (${
                  psnSourceIds.join(",")
                }); limit 10;`,
              )) as { game: number }[];
              if (links.length) {
                candidates = (await igdb.post(
                  "games",
                  `${GAME_FIELDS} where id = (${links.map((l) => l.game).join(",")});`,
                )) as IgdbGame[];
              }
            }
            let match = pickIgdbMatch(candidates, q);
            if (!match) {
              candidates = (await igdb.post("games", `${GAME_FIELDS} search ${quote(g.title)}; limit 10;`)) as IgdbGame[];
              match = pickIgdbMatch(candidates, q);
            }
            details.push(mapIgdb(id, match));
          } catch (err) {
            context.logger.warning("IGDB lookup failed for {title}: {error}", {
              title: g.title,
              error: (err as Error).message,
            });
          }
        }
        const asked = args.ids.filter((id) => gameById.has(id)).length;
        if (tooManyFailures(asked - details.length, asked)) {
          throw new Error(`${asked - details.length} of ${asked} IGDB lookups failed; IGDB may be down. Nothing was written.`);
        }
        context.logger.info("IGDB matched {matched} of {total}", {
          matched: details.filter((d) => d.igdbId !== null).length,
          total: args.ids.length,
        });
        const handle = await context.writeResource("igdb", "igdb", { details });
        return { dataHandles: [handle] };
      },
    },
  },
};
