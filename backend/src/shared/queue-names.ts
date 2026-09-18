/** Single source of queue names for api producers and worker consumers. */
export const QUEUE_NAMES = {
  learn: 'learn',
  mediaImage: 'media-image',
} as const;

export const LEARN_JOB_NAME = 'learn';
export const IMAGE_JOB_NAME = 'image';
