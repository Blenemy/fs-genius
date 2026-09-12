/** Должно совпадать с enum Role в schema.prisma. */
export type UserRole = "USER" | "ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export const PASSWORD_MIN = 8;
export const NAME_MAX = 100;
