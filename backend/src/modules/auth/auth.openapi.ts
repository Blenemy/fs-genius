import { jsonError, registerPath, schemaFromZod } from "../../lib/openapi.js";
import { loginSchema } from "./auth.schema.js";

export function registerAuthDocs(): void {
  registerPath("/auth/login", {
    post: {
      tags: ["auth"],
      summary: "Вход",
      description:
        "Ставит две httpOnly-куки: access_token (Path=/api) и refresh_token (Path=/api/auth). В теле только user — токенов в JSON нет.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: schemaFromZod(loginSchema),
          },
        },
      },
      responses: {
        "200": {
          description:
            "Сессия выдана. Браузер сохранит Set-Cookie сам; фронт читает user и ставит status: authed.",
          headers: {
            "Set-Cookie": {
              description:
                "Две куки. access_token — 15 мин, Path=/api. refresh_token — 30 дней, Path=/api/auth. HttpOnly, SameSite=Lax.",
              schema: { type: "string" },
            },
          },
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthUserResponse" },
            },
          },
        },
        "400": jsonError(
          "VALIDATION_FAILED — невалидная почта или пустой пароль. details.issues[]: field, message.",
        ),
        "401": jsonError(
          "INVALID_CREDENTIALS — одна формулировка и для неизвестной почты, и для неверного пароля. Не ветвить UI по тексту.",
        ),
      },
    },
  });
}
