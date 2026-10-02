import { z } from "npm:zod@4";
import { applyRun, checkPlausible, idsToFetch, type Mode } from "./lib/merge.ts";
import { commitMessage } from "./lib/summary.ts";
import {
  GameListSchema,
  type GameRecord,
  type IgdbDetails,
  IgdbDetailsSchema,
  type LibraryGame,
  LibraryGameSchema,
  type StoreDetails,
  StoreDetailsSchema,
} from "./lib/schemas.ts";

const Global = z.object({ path: z.string().default("docs/games.json") });

async function readList(file: string): Promise<GameRecord[]> {
  try {
    return GameListSchema.parse(JSON.parse(await Deno.readTextFile(file))).games;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return [];
    throw err;
  }
}

export const model = {
  type: "@catjen/gamelist",
  version: "2026.10.02.1",
  globalArguments: Global,
  resources: {
    plan: {
      description: "Games to fetch details for",
      schema: z.object({ ids: z.array(z.string()) }),
      lifetime: "infinite",
      garbageCollection: 6,
    },
    summary: {
      description: "What a write changed",
      schema: z.object({
        message: z.string().nullable(),
        added: z.number(),
        updated: z.number(),
        gone: z.number(),
        dryRun: z.boolean(),
      }),
      lifetime: "infinite",
      garbageCollection: 12,
    },
  },
  methods: {
    plan: {
      description: "Compare the library with the list and decide which games need details",
      arguments: z.object({ games: z.array(LibraryGameSchema), mode: z.enum(["new", "rebuild"]) }),
      // deno-lint-ignore no-explicit-any
      execute: async (args: { games: LibraryGame[]; mode: Mode }, context: any) => {
        const existing = await readList(`${context.repoDir}/${context.globalArgs.path}`);
        checkPlausible(existing, args.games);
        const ids = idsToFetch(existing, args.games, args.mode);
        context.logger.info("{count} games need details ({mode})", { count: ids.length, mode: args.mode });
        return { dataHandles: [await context.writeResource("plan", "plan", { ids })] };
      },
    },
    write: {
      description: "Merge the run into the list file",
      arguments: z.object({
        games: z.array(LibraryGameSchema),
        store: z.array(StoreDetailsSchema),
        igdb: z.array(IgdbDetailsSchema),
        dryRun: z.boolean().default(false),
        today: z.string().optional(),
      }),
      execute: async (
        args: { games: LibraryGame[]; store: StoreDetails[]; igdb: IgdbDetails[]; dryRun: boolean; today?: string },
        // deno-lint-ignore no-explicit-any
        context: any,
      ) => {
        const file = `${context.repoDir}/${context.globalArgs.path}`;
        const existing = await readList(file);
        const today = args.today ?? new Date().toISOString().slice(0, 10);
        const r = applyRun({ existing, library: args.games, store: args.store, igdb: args.igdb, today });
        const message = commitMessage(r.added.length, r.updated.length, r.gone.length);
        if (message && !args.dryRun) {
          await Deno.writeTextFile(file, JSON.stringify({ games: r.games }, null, 2) + "\n");
        }
        context.logger.info("{message}{dry}", {
          message: message ?? "No changes",
          dry: args.dryRun ? " (dry run)" : "",
        });
        const handle = await context.writeResource("summary", "summary", {
          message,
          added: r.added.length,
          updated: r.updated.length,
          gone: r.gone.length,
          dryRun: args.dryRun,
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
