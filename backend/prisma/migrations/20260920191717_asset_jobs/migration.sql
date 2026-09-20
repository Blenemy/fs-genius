-- AlterTable
ALTER TABLE `Derivative` ADD COLUMN `jobId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Job` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `type` ENUM('PROBE', 'IMAGE_VARIANTS', 'VIDEO_TRANSCODE', 'AUDIO_EXTRACT') NOT NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELED') NOT NULL DEFAULT 'QUEUED',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,
    `presetKey` VARCHAR(50) NULL,
    `queueJobId` VARCHAR(100) NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Job_assetId_idx`(`assetId`),
    INDEX `Job_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Derivative` ADD CONSTRAINT `Derivative_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
