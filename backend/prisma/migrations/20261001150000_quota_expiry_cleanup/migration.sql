-- 500 MB default quota for every user.
ALTER TABLE `User` MODIFY `quotaBytes` BIGINT NOT NULL DEFAULT 524288000;
UPDATE `User` SET `quotaBytes` = 524288000;

ALTER TABLE `Asset` ADD COLUMN `expiresAt` DATETIME(3) NULL;

UPDATE `Asset` SET `expiresAt` = DATE_ADD(`createdAt`, INTERVAL 30 DAY)
WHERE `expiresAt` IS NULL;

ALTER TABLE `Asset` MODIFY `expiresAt` DATETIME(3) NOT NULL;

CREATE INDEX `Asset_status_createdAt_idx` ON `Asset`(`status`, `createdAt`);
CREATE INDEX `Asset_expiresAt_idx` ON `Asset`(`expiresAt`);
CREATE INDEX `Asset_userId_status_idx` ON `Asset`(`userId`, `status`);
