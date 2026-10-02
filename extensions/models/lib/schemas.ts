import { z } from "npm:zod@4";

export const EntitlementSchema = z.object({
  conceptId: z.string().nullable(),
  entitlementId: z.string(),
  productId: z.string(),
  titleId: z.string(),
  name: z.string(),
  platform: z.string(),
  membership: z.enum(["NONE", "PS_PLUS"]),
  imageUrl: z.string().nullable(),
});
export type Entitlement = z.infer<typeof EntitlementSchema>;

export const LibraryGameSchema = z.object({
  id: z.string(),
  conceptId: z.string().nullable(),
  title: z.string(),
  platforms: z.array(z.string()),
  access: z.enum(["owned", "claimed"]),
  productIds: z.array(z.string()),
  titleIds: z.array(z.string()),
  imageUrl: z.string().nullable(),
});
export type LibraryGame = z.infer<typeof LibraryGameSchema>;

export const StoreProductSchema = z.object({
  productId: z.string(),
  listed: z.boolean(),
  conceptId: z.string().nullable(),
  kind: z.enum(["game", "other"]).nullable(),
  description: z.string().nullable(),
  releaseYear: z.number().int().nullable(),
  ageRating: z.string().nullable(),
  onlineRequired: z.boolean().nullable(),
  coverUrl: z.string().nullable(),
  localPlayers: z.number().int().nullable(),
  onlinePlayers: z.number().int().nullable(),
  localCoop: z.literal(true).nullable(),
});
export type StoreProduct = z.infer<typeof StoreProductSchema>;

export const StoreDetailsSchema = z.object({
  id: z.string(),
  kind: z.enum(["game", "other"]),
  description: z.string().nullable(),
  releaseYear: z.number().int().nullable(),
  ageRating: z.string().nullable(),
  onlineRequired: z.boolean().nullable(),
  coverUrl: z.string().nullable(),
  localPlayers: z.number().int().nullable(),
  onlinePlayers: z.number().int().nullable(),
  // Only "the store text says local co-op"; used to fill a gap IGDB leaves.
  localCoop: z.literal(true).nullable(),
});
export type StoreDetails = z.infer<typeof StoreDetailsSchema>;

export const IgdbDetailsSchema = z.object({
  id: z.string(),
  soloStory: z.boolean().nullable(),
  couchCoop: z.boolean().nullable(),
  couchCoopMax: z.number().int().nullable(),
  couchVersus: z.boolean().nullable(),
  couchVersusMax: z.number().int().nullable(),
  splitScreen: z.boolean().nullable(),
  onlineCoop: z.boolean().nullable(),
  onlineCoopMax: z.number().int().nullable(),
  onlineVersus: z.boolean().nullable(),
  onlineVersusMax: z.number().int().nullable(),
  genres: z.array(z.string()).nullable(),
  igdbId: z.number().int().nullable(),
  // Default so lists written before this field existed still load.
  igdbUrl: z.string().nullable().default(null),
  matchedBy: z.enum(["psn-id", "title-year", "title"]).nullable(),
});
export type IgdbDetails = z.infer<typeof IgdbDetailsSchema>;

export const GameRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  platforms: z.array(z.string()),
  productIds: z.array(z.string()),
  access: z.enum(["owned", "claimed", "gone"]),
  addedOn: z.string(),
  goneOn: z.string().nullable(),
  ...StoreDetailsSchema.omit({ id: true, kind: true, localCoop: true, localPlayers: true, onlinePlayers: true }).shape,
  // Defaults so lists written before these fields existed still load.
  localPlayers: z.number().int().nullable().default(null),
  onlinePlayers: z.number().int().nullable().default(null),
  ...IgdbDetailsSchema.omit({ id: true }).shape,
});
export type GameRecord = z.infer<typeof GameRecordSchema>;
export type Access = GameRecord["access"];

export const GameListSchema = z.object({
  lastSync: z.string().nullable().default(null),
  games: z.array(GameRecordSchema),
});
