/**
 * ГАЙДЛАЙН. Здесь пока нет кода — только то, что нужно написать.
 * Образец рядом: src/modules/users/users.schema.ts и uploads/uploads.schema.ts.
 *
 * Файл со схемами — это граница доверия. Всё, что прошло safeParse, дальше
 * считается корректным по форме; сервис проверяет только то, что нельзя
 * проверить без базы (занята ли почта, сходится ли пароль).
 *
 * ── Что здесь должно появиться ───────────────────────────────────────────────
 *
 * 1. import { z } from 'zod';   // zod 4, как в users.schema.ts
 *
 * 2. Константы наверху файла, как MAX_IMAGE_BYTES в uploads.schema.ts:
 *
 *      PASSWORD_MIN  — 8. Меньше восьми не пускают уже нигде.
 *      PASSWORD_MAX  — 200. Верхняя граница нужна не «для порядка»:
 *                      argon2 считает хеш тем дольше, чем длиннее вход,
 *                      и поле пароля без ограничения — это способ занять
 *                      процессор одним запросом.
 *      NAME_MAX      — 100, ровно как @db.VarChar(100) у User.name.
 *                      Если разойдётся со схемой Prisma, ошибка вылезет
 *                      не здесь, а в MySQL, и будет 500 вместо 400.
 *
 * 3. registerSchema: z.object({ email, password, name })
 *
 *      email    — z.email() (в zod 4 это top-level функция, не z.string().email()),
 *                 плюс .trim() и .toLowerCase(). Приведение к нижнему регистру
 *                 обязательно: без него Ivan@mail.com и ivan@mail.com — два
 *                 разных пользователя, @unique их не поймает, а человек будет
 *                 уверен, что уже регистрировался.
 *      password — z.string().min(PASSWORD_MIN).max(PASSWORD_MAX).
 *                 БЕЗ .trim(): пробел внутри пароля — часть пароля.
 *      name     — z.string().trim().min(1).max(NAME_MAX).
 *
 *      Сообщения — по-русски, строчными, как в users.schema.ts
 *      ('имя не может быть пустым'). Их увидит человек в форме.
 *
 * 4. loginSchema: email и password.
 *
 *      email — та же нормализация, что при регистрации, иначе войти
 *              с Ivan@mail.com не получится.
 *      password — просто z.string().min(1). Правила длины здесь не нужны:
 *              старый пароль мог быть заведён по другим правилам, и
 *              «пароль слишком короткий» на форме входа — это подсказка
 *              тому, кто перебирает чужие пароли.
 *
 * 5. Экспорт выведенных типов, как в users.schema.ts:
 *
 *      export type RegisterInput = z.infer<typeof registerSchema>;
 *      export type LoginInput = z.infer<typeof loginSchema>;
 *
 * ── Чего здесь быть не должно ────────────────────────────────────────────────
 *
 * Схемы на refresh и logout. Они не читают тело запроса вообще — токен
 * приходит кукой. Пустой z.object({}) на них не нужен.
 */

import { z } from "zod";
import { Prisma } from "../../generated/prisma/client.js";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 100;
export const NAME_MAX = 20;

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
