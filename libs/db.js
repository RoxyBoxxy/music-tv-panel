import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";

let dbPromise = (async () => {
  const db = await open({
    filename: "./db/panel.sqlite",
    driver: sqlite3.Database
  });
  const schema = fs.readFileSync("./db/template/schema.sql", "utf8");
  await db.exec(schema);
  return db;
})();

export default dbPromise;
