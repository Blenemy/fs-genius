-- AlterTable
ALTER TABLE `Asset` MODIFY `status` ENUM('PENDING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED') NOT NULL DEFAULT 'PENDING';

-- Existing processed files were stuck on UPLOADED; thumbs mean the pipeline finished.
UPDATE `Asset`
SET `status` = 'READY'
WHERE `status` = 'UPLOADED'
  AND EXISTS (
    SELECT 1 FROM `Derivative`
    WHERE `Derivative`.`assetId` = `Asset`.`id`
      AND `Derivative`.`kind` = 'THUMBNAIL'
  );

-- CreateIndex
CREATE INDEX `Asset_status_idx` ON `Asset`(`status`);
