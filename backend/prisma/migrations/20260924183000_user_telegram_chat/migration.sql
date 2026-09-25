ALTER TABLE `User` ADD COLUMN `telegramChatId` BIGINT NULL;

CREATE UNIQUE INDEX `User_telegramChatId_key` ON `User`(`telegramChatId`);
