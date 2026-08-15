import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { classes } from "./db/schema";

const app = new Hono();
app.use("*", cors());

function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql);
}

app.get("/api/classes", async (c) => {
  const db = getDb();
  try {
    const data = await db.select().from(classes);
    return c.json({ success: true, data });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

export default app;
