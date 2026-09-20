import { Router } from "express";
import { mediaEventsHub } from "../../lib/container.js";
import { requireAuth } from "../../middleware/auth.js";

export const eventsRouter: Router = Router();

eventsRouter.get("/events", requireAuth, (req, res) => {
  void mediaEventsHub.subscribe(req, res);
});
