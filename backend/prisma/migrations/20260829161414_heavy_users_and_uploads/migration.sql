-- Таблица User уже не пустая, поэтому обязательные city и country добавляются
-- с временным значением по умолчанию: существующие строки заполняются им,
-- а следом умолчание снимается — в схеме этих полей без значения быть не должно.

-- AlterTable
ALTER TABLE `User` ADD COLUMN `avatarUrl` VARCHAR(255) NULL,
    ADD COLUMN `bio` TEXT NULL,
    ADD COLUMN `city` VARCHAR(80) NOT NULL DEFAULT '—',
    ADD COLUMN `company` VARCHAR(120) NULL,
    ADD COLUMN `country` VARCHAR(2) NOT NULL DEFAULT 'XX',
    ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
    ADD COLUMN `plan` ENUM('FREE', 'PRO', 'ENTERPRISE') NOT NULL DEFAULT 'FREE',
    ADD COLUMN `quotaBytes` BIGINT NOT NULL DEFAULT 1073741824,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `User` ALTER COLUMN `city` DROP DEFAULT;
ALTER TABLE `User` ALTER COLUMN `country` DROP DEFAULT;

-- CreateTable
CREATE TABLE `Upload` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` ENUM('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT') NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'DONE', 'FAILED') NOT NULL DEFAULT 'DONE',
    `sizeBytes` BIGINT NOT NULL,
    `durationMs` INTEGER NULL,
    `title` VARCHAR(160) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Upload_userId_idx`(`userId`),
    INDEX `Upload_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Upload` ADD CONSTRAINT `Upload_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
