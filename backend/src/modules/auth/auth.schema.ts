import { z } from "zod";
import { Prisma } from "../../generated/prisma/client.js";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 100;
export const NAME_MAX = 100;

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .email({ message: "некорректный адрес" })
    .toLowerCase(),
  password: z
    .string()
    .min(PASSWORD_MIN, { message: `не меньше ${PASSWORD_MIN} символов` })
    .max(PASSWORD_MAX, { message: `не больше ${PASSWORD_MAX} символов` }),
  name: z
    .string()
    .trim()
    .min(1, { message: "имя не может быть пустым" })
    .max(NAME_MAX, { message: `не больше ${NAME_MAX} символов` }),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email({ message: "некорректный адрес" })
    .toLowerCase(),
  password: z.string().min(1, { message: "пароль не может быть пустым" }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export interface SessionMeta {
  userAgent: string | null;
  ip: string | null;
}

export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;
