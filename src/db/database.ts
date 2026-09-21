import { Collection, Db, MongoClient, Document } from "mongodb";
import { config } from "../config";

let client: MongoClient | undefined;
let db: Db;

export async function initDb() {
  if (!config.databaseUrl) return;
  client = new MongoClient(config.databaseUrl);
  await client.connect();
  db = client.db(config.databaseName);
  await Promise.all([
    collection("activity_stats").createIndex({ guild_id: 1, user_id: 1, period_type: 1, period_start: 1 }, { unique: true }),
    collection("xp_accounts").createIndex({ guild_id: 1, user_id: 1 }, { unique: true }),
    collection("guild_settings").createIndex({ guild_id: 1, key: 1 }, { unique: true }),
    collection("tickets").createIndex({ guild_id: 1, user_id: 1, status: 1 }),
    collection("warnings").createIndex({ guild_id: 1, user_id: 1, created_at: -1 })
  ]);
}

export function collection<T extends Document = Document>(name: string): Collection<T> {
  if (!db) throw new Error("MongoDB is not initialized");
  return db.collection<T>(name);
}

export async function closeDb() {
  await client?.close();
}
