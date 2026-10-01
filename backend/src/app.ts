import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
// import { pinoHttp } from "pino-http";
import { corsOrigins, env } from "./config/env.js";
// import { logger } from "./lib/logger.js";
import { checkOrigin } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { uploadRouter } from "./modules/uploads/uploads.routes.js";
import { assetsRouter } from "./modules/assets/assets.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { docsRouter } from "./modules/docs/docs.routes.js";
import { eventsRouter } from "./modules/events/events.routes.js";
import { telegramRouter } from "./modules/telegram/telegram.routes.js";
// Stripe-песочница снята с продукта. Ручки в billing.routes.ts закомментированы.
// import {
//   billingRouter,
//   billingWebhookRouter,
// } from "./modules/billing/billing.routes.js";

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", env.TRUST_PROXY);

  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? Number(value) : value,
  );

  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(cookieParser());
  app.use(checkOrigin);
  // Stripe webhook (сырое тело под подпись) выключен вместе с биллингом.
  // app.use(
  //   "/api/billing/webhook",
  //   express.raw({ type: "application/json" }),
  //   billingWebhookRouter,
  // );
  app.use(express.json({ limit: "1mb" }));
  // app.use(pinoHttp({ logger }));

  app.use("/api", healthRouter);
  app.use("/api", usersRouter);
  app.use("/api", uploadRouter);
  app.use("/api", assetsRouter);
  app.use("/api", authRouter);
  app.use("/api", docsRouter);
  app.use("/api", eventsRouter);
  app.use("/api", telegramRouter);
  // app.use("/api", billingRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
