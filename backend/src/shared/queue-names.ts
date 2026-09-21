/** Single source of queue names for api producers and worker consumers. */
export const QUEUE_NAMES = {
  mediaProbe: 'media-probe',
  mediaImage: 'media-image',
  mediaVideo: 'media-video',
} as const;

export const PROBE_JOB_NAME = 'probe';
export const IMAGE_JOB_NAME = 'image';
export const VIDEO_JOB_NAME = 'video';
