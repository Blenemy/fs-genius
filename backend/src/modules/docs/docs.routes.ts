import { Router, type RequestHandler } from "express";
import {
  serve as swaggerServe,
  setup as swaggerSetup,
} from "swagger-ui-express";
import { buildOpenApiSpec } from "../../lib/openapi.js";
import { registerAuthDocs } from "../auth/auth.openapi.js";

registerAuthDocs();

export const docsRouter: Router = Router();

const relaxDocsCsp: RequestHandler = (_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
  );
  next();
};

docsRouter.get("/openapi.json", (_req, res) => {
  res.json(buildOpenApiSpec());
});

docsRouter.use(
  "/docs",
  relaxDocsCsp,
  ...swaggerServe,
  swaggerSetup(null, {
    customSiteTitle: "Media pipeline API",
    swaggerUrl: "/api/openapi.json",
    swaggerOptions: {
      persistAuthorization: true,
      withCredentials: true,
    },
  }),
);
