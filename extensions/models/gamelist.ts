import { z } from "npm:zod@4";
import { groupLibrary } from "./lib/group.ts";
import { applyRun } from "./lib/merge.ts";
import { checkPlausible, type Mode, productsToLookUp } from "./lib/plan.ts";
import { commitMessage } from "./lib/summary.ts";
import {
  type Entitlement,
  EntitlementSchema,
  GameListSchema,
  type GameRecord,
  type IgdbDetails,
  IgdbDetailsSchema,
  type LibraryGame,
  LibraryGameSchema,
  type StoreDetails,
  StoreDetailsSchema,
  type StoreProduct,
  StoreProductSchema,
} from "./lib/schemas.ts";

const Global = z.object({ path: z.string().default("docs/games.json") });
const ModeSchema = z.enum(["new", "rebuild"]);

async function readList(file: string): Promise<GameRecord[]> {
  try {
    return GameListSchema.parse(JSON.parse(await Deno.readTextFile(file))).games;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return [];
    throw err;
  }
}

// deno-lint-ignore no-explicit-any
const listPath = (context: any) => `${context.repoDir}/${context.globalArgs.path}`;

export const model = {
  type: "@catjen/gamelist",
  version: "2026.10.02.4",
  globalArguments: Global,
  resources: {
    plan: {
      description: "Products to look up in the store",
      schema: z.object({ productIds: z.array(z.string()) }),
      lifetime: "infinite",
      garbageCollection: 6,
    },
    grouped: {
      description: "One game per concept, and which games need details",
      schema: z.object({
        games: z.array(LibraryGameSchema),
        ids: z.array(z.string()),
        store: z.array(StoreDetailsSchema),
      }),
      lifetime: "infinite",
      garbageCollection: 6,
    },
    summary: {
      description: "What a write changed",
      schema: z.object({
        message: z.string(),
        added: z.number(),
        updated: z.number(),
        gone: z.number(),
        dryRun: z.boolean(),
        // The commit step runs only when this is true; git refuses an empty commit.
        fileChanged: z.boolean(),
      }),
      lifetime: "infinite",
      garbageCollection: 12,
    },
  },
  methods: {
    plan: {
      description: "Check the account against the list and pick the products to look up",
      arguments: z.object({ entitlements: z.array(EntitlementSchema), mode: ModeSchema }),
      // deno-lint-ignore no-explicit-any
      execute: async (args: { entitlements: Entitlement[]; mode: Mode }, context: any) => {
        const existing = await readList(listPath(context));
        checkPlausible(existing, args.entitlements);
        const productIds = productsToLookUp(existing, args.entitlements, args.mode);
        context.logger.info("{count} products to look up ({mode})", { count: productIds.length, mode: args.mode });
        return { dataHandles: [await context.writeResource("plan", "plan", { productIds })] };
      },
    },
    group: {
      description: "Group entitlements into games and pick the games that need details",
      arguments: z.object({
        entitlements: z.array(EntitlementSchema),
        products: z.array(StoreProductSchema),
        planned: z.array(z.string()).default([]),
        mode: ModeSchema,
      }),
      execute: async (
        args: { entitlements: Entitlement[]; products: StoreProduct[]; planned?: string[]; mode: Mode },
        // deno-lint-ignore no-explicit-any
        context: any,
      ) => {
        const existing = await readList(listPath(context));
        const r = groupLibrary({ ...args, existing });
        context.logger.info("{games} games, {ids} need details", { games: r.games.length, ids: r.ids.length });
        return { dataHandles: [await context.writeResource("grouped", "grouped", r)] };
      },
    },
    write: {
      description: "Merge the run into the list file and record the sync date",
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
        const file = listPath(context);
        const existing = await readList(file);
        const today = args.today ?? new Date().toISOString().slice(0, 10);
        const r = applyRun({ existing, library: args.games, store: args.store, igdb: args.igdb, today });
        // Written every run, so the page can tell a stale list from a quiet month.
        const message = commitMessage(r.added.length, r.updated.length, r.gone.length) ?? "Sync: no game changes";
        const text = JSON.stringify({ lastSync: today, games: r.games }, null, 2) + "\n";
        const before = await Deno.readTextFile(file).catch(() => null);
        const fileChanged = !args.dryRun && text !== before;
        if (fileChanged) await Deno.writeTextFile(file, text);
        context.logger.info("{message}{dry}", { message, dry: args.dryRun ? " (dry run)" : "" });
        const handle = await context.writeResource("summary", "summary", {
          message,
          added: r.added.length,
          updated: r.updated.length,
          gone: r.gone.length,
          dryRun: args.dryRun,
          fileChanged,
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
