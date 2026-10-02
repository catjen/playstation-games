import { z } from "npm:zod@4";
import { exchangeAccessCodeForAuthTokens, exchangeNpssoForAccessCode } from "npm:psn-api@2.18.1";
import { tooManyFailures } from "./lib/failures.ts";
import { fetchAllEntitlements } from "./lib/psn_library.ts";
import { fetchProductPage } from "./lib/store_client.ts";
import { extractProduct, mapProduct } from "./lib/store_map.ts";
import { type Entitlement, EntitlementSchema, type StoreProduct, StoreProductSchema } from "./lib/schemas.ts";

export const RENEW_STEPS =
  "PSN login has expired or was refused. Renew it: run 'pwsh -File scripts/renew-psn.ps1' in the repo " +
  "(it opens https://ca.account.sony.com/api/v1/ssocookie; log in at https://www.playstation.com first if " +
  "that page shows an error).";

type Client = {
  login: (npsso: string) => Promise<{ accessToken: string }>;
  entitlements: (auth: { accessToken: string }) => Promise<Entitlement[]>;
};

// Refresh tokens last ten days and do not rotate (probe, 02.10.2026), so a
// monthly run logs in from the NPSSO every time.
const liveClient: Client = {
  login: async (npsso) => await exchangeAccessCodeForAuthTokens(await exchangeNpssoForAccessCode(npsso)),
  entitlements: (auth) => fetchAllEntitlements(auth),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const liveStore = async (productId: string) => {
  await sleep(150);
  return await fetchProductPage(productId, "en-NO");
};

async function login(client: Client, npsso: string) {
  try {
    return await client.login(npsso.trim());
  } catch (err) {
    throw new Error(`${RENEW_STEPS} (cause: ${(err as Error).message})`);
  }
}

// Piping the token into `swamp vault put` from PowerShell stores a trailing line break.
export const NpssoArgs = z.object({ npsso: z.string().trim().length(64) });

export const model = {
  type: "@catjen/psn",
  version: "2026.10.02.1",
  globalArguments: z.object({}),
  resources: {
    library: {
      description: "Entitlements on the account",
      schema: z.object({ entitlements: z.array(EntitlementSchema) }),
      lifetime: "infinite",
      garbageCollection: 6,
    },
    store: {
      description: "Store product data for looked-up products",
      schema: z.object({ products: z.array(StoreProductSchema) }),
      lifetime: "infinite",
      garbageCollection: 6,
    },
  },
  methods: {
    check: {
      description: "Log in with the NPSSO and write nothing; used after renewing it",
      arguments: NpssoArgs,
      // deno-lint-ignore no-explicit-any
      execute: async (args: { npsso: string; _client?: Client }, context: any) => {
        await login(args._client ?? liveClient, args.npsso);
        context.logger.info("PSN login works");
        return { dataHandles: [] };
      },
    },
    library: {
      description: "Log in and list every entitlement on the account",
      arguments: NpssoArgs,
      // deno-lint-ignore no-explicit-any
      execute: async (args: { npsso: string; _client?: Client }, context: any) => {
        const client = args._client ?? liveClient;
        const auth = await login(client, args.npsso);
        const entitlements = await client.entitlements(auth);
        context.logger.info("PSN account has {count} entitlements", { count: entitlements.length });
        return { dataHandles: [await context.writeResource("library", "library", { entitlements })] };
      },
    },
    details: {
      description: "Read the public store page of each product",
      arguments: z.object({ productIds: z.array(z.string()) }),
      execute: async (
        args: { productIds: string[]; _store?: (productId: string) => Promise<string> },
        // deno-lint-ignore no-explicit-any
        context: any,
      ) => {
        const page = args._store ?? liveStore;
        const products: StoreProduct[] = [];
        for (const id of args.productIds) {
          try {
            products.push(mapProduct(id, extractProduct(await page(id), id)));
          } catch (err) {
            context.logger.warning("Store lookup failed for {id}: {error}", { id, error: (err as Error).message });
          }
        }
        const failedCount = args.productIds.length - products.length;
        if (tooManyFailures(failedCount, args.productIds.length)) {
          throw new Error(`${failedCount} of ${args.productIds.length} store lookups failed; the store may be down or changed. Nothing was written.`);
        }
        context.logger.info("Store: {listed} listed, {unlisted} not on the store, {failed} failed", {
          listed: products.filter((p) => p.listed).length,
          unlisted: products.filter((p) => !p.listed).length,
          failed: args.productIds.length - products.length,
        });
        return { dataHandles: [await context.writeResource("store", "store", { products })] };
      },
    },
  },
};
