-- CreateTable
CREATE TABLE `Derivative` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `kind` ENUM('THUMBNAIL', 'PREVIEW', 'POSTER', 'VIDEO_720P', 'AUDIO_MP3') NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` BIGINT NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Derivative_storageKey_key`(`storageKey`),
    INDEX `Derivative_assetId_idx`(`assetId`),
    UNIQUE INDEX `Derivative_assetId_kind_key`(`assetId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Derivative` ADD CONSTRAINT `Derivative_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
