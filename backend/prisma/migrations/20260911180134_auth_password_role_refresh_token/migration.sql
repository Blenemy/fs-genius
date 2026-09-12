-- Таблица User уже населена сидом, поэтому обязательный passwordHash добавляется
-- в два шага: сначала с временным умолчанием, чтобы существующие строки что-то
-- получили, следом умолчание снимается — в схеме этого поля без значения быть
-- не должно. Тот же приём, что и для city/country в 20260829161414.
--
-- Пустая строка не является хешем argon2, поэтому войти под сидовыми
-- пользователями нельзя. Проверка пароля обязана считать брошенное argon2
-- исключение отказом, а не ошибкой сервера.
--
-- У city и country умолчание, наоборот, появляется насовсем: форма регистрации
-- их не спрашивает.

-- AlterTable
ALTER TABLE `User` ADD COLUMN `passwordHash` VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    MODIFY `city` VARCHAR(80) NOT NULL DEFAULT '',
    MODIFY `country` VARCHAR(2) NOT NULL DEFAULT '';

-- Умолчание снимаем только у passwordHash; у city и country оно остаётся.
ALTER TABLE `User` ALTER COLUMN `passwordHash` DROP DEFAULT;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `familyId` VARCHAR(36) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `replacedById` VARCHAR(191) NULL,
    `userAgent` VARCHAR(255) NULL,
    `ip` VARCHAR(45) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_tokenHash_key`(`tokenHash`),
    INDEX `RefreshToken_userId_idx`(`userId`),
    INDEX `RefreshToken_familyId_idx`(`familyId`),
    INDEX `RefreshToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
