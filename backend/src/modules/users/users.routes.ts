import { Router, type RequestHandler } from "express";
import { usersService } from "../../lib/container.js";
import { parseOrThrow } from "../../lib/parse.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { reportQuerySchema } from "./users.schema.js";

export const usersRouter: Router = Router();

const adminOnly: RequestHandler[] = [requireAuth, requireRole("ADMIN")];

usersRouter.get("/users/report", ...adminOnly, async (req, res) => {
  const data = parseOrThrow(
    reportQuerySchema,
    req.query,
    "Некорректные параметры отчёта",
  );

  res.json(await usersService.getReport(data));
});

usersRouter.get("/users", ...adminOnly, async (_req, res) => {
  const users = await usersService.list();
  res.json({ users });
});
