import "dotenv/config";
import postgres from "postgres";
import { seed } from "./seed";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
seed(sql)
  .then((counts) => console.log("Seeded", counts))
  .finally(() => sql.end());
