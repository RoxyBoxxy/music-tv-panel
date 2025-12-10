import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dbPromise from "./db.js";

// Middleware: if no users exist, redirect to setup-user
export async function checkUserSetup(req, res, next) {
  const db = await dbPromise;
  const row = await db.get("SELECT COUNT(*) AS cnt FROM users");
  if (row.cnt === 0 && req.path !== "/setup-user" && req.path !== "/setup-user/create") {
    return res.redirect("/setup-user");
  }
  next();
}

// Middleware: require valid JWT, fetch user from DB
export async function requireAuth(req, res, next) {
  const token = req.cookies.auth;
  if (!token) return res.redirect("/login");

  try {
    const payload = jwt.verify(token, process.env.SESSION_SECRET);
    const db = await dbPromise;
    const user = await db.get("SELECT id, username FROM users WHERE id = ?", payload.user_id);

    if (!user) return res.redirect("/login");

    req.user = user;
    next();
  } catch (e) {
    return res.redirect("/login");
  }
}
