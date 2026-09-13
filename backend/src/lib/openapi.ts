import { z } from "zod";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

const paths: Record<string, Record<string, unknown>> = {};

export function schemaFromZod(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "openapi-3.0" }) as Record<
    string,
    unknown
  >;
  delete json["$schema"];
  delete json["id"];
  return json;
}

export function jsonError(description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  };
}

export function registerPath(
  path: string,
  operations: Partial<Record<HttpMethod, Record<string, unknown>>>,
): void {
  paths[path] = { ...paths[path], ...operations };
}

export function buildOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Media pipeline API",
      version: "0.1.0",
    },
    servers: [{ url: "/api" }],
    paths,
    components: {
      securitySchemes: {
        accessCookie: {
          type: "apiKey",
          in: "cookie",
          name: "access_token",
          description: "httpOnly, Path=/api. JS её не читает.",
        },
        refreshCookie: {
          type: "apiKey",
          in: "cookie",
          name: "refresh_token",
          description: "httpOnly, Path=/api/auth. JS её не читает.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", example: "INVALID_CREDENTIALS" },
                message: { type: "string" },
                details: {},
              },
            },
          },
        },
        PublicUser: {
          type: "object",
          required: ["id", "email", "name", "role"],
          properties: {
            id: { type: "string" },
            email: { type: "string", format: "email" },
            name: { type: "string" },
            role: { type: "string", enum: ["USER", "ADMIN"] },
          },
        },
        AuthUserResponse: {
          type: "object",
          required: ["user"],
          properties: {
            user: { $ref: "#/components/schemas/PublicUser" },
          },
        },
      },
    },
  };
}
