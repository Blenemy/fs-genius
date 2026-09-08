-- CreateTable
CREATE TABLE `Asset` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL DEFAULT 'local-dev',
    `originalName` VARCHAR(255) NOT NULL,
    `contentType` VARCHAR(100) NOT NULL,
    `sizeBytes` BIGINT NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'UPLOADED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Asset_storageKey_key`(`storageKey`),
    INDEX `Asset_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
