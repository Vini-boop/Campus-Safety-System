export const MAX_MEDIA_FILES = 5;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/heic'];
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
export const ACCEPTED_MEDIA_TYPES = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES];
export const MAX_FILE_SIZE_MB = 50; // 50MB per file
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
