-- Row lock for the shared 10 GB storage cap (Cloudflare R2 free tier).
CREATE TABLE `QuotaLock` (
    `id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `QuotaLock` (`id`) VALUES (1);
