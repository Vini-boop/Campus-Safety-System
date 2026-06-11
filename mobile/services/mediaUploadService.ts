/**
 * Media Upload Service for Campus Safety App
 * Handles uploading media files to cloud storage after report creation
 */

import { ACCEPTED_MEDIA_TYPES, MAX_FILE_SIZE_BYTES } from '@/constants/mediaConfig';
import * as FileSystem from 'expo-file-system';
import { logAppError } from '@/utils/errorReporting';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/services/firebase';

interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

interface BatchUploadResult {
  success: boolean;
  uploadedUrls: string[];
  failedCount: number;
  errors: string[];
}

/**
 * Upload a single media file to cloud storage
 * @param asset - ImagePicker asset object
 * @param reportId - ID of the report this media belongs to
 * @returns Upload result with URL or error
 */
export async function uploadMediaFile(
  asset: any,
  reportId: string
): Promise<UploadResult> {
  try {
    // Create storage reference
    const fileName = asset.fileName || `image_${Date.now()}.jpg`;
    const storageRef = ref(storage, `reports/${reportId}/${Date.now()}_${fileName}`);

    console.log(`📁 Uploading media for report ${reportId}:`, asset.uri);

    // Read file as bytes
    const fileUri = asset.uri;
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    // Determine content type based on asset.type or file extension
    let contentType = asset.type;
    if (!contentType) {
      const ext = fileUri.split('.').pop()?.toLowerCase();
      if (ext === 'mp4') contentType = 'video/mp4';
      else if (ext === 'mov') contentType = 'video/quicktime';
      else if (ext === 'png') contentType = 'image/png';
      else if (ext === 'heic') contentType = 'image/heic';
      else contentType = 'image/jpeg';
    }

    // Upload file using fetch/blob approach
    const response = await fetch(fileUri);
    const blob = await response.blob();

    // Upload file to Firebase Storage
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType
    });

    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    console.log(`✅ Media uploaded successfully:`, downloadURL);

    return {
      success: true,
      url: downloadURL
    };
  } catch (error: any) {
    await logAppError(error, 'uploadMediaFile', { reportId, assetUri: asset.uri });

    return {
      success: false,
      error: error.message || 'Failed to upload media file'
    };
  }
}

/**
 * Upload multiple media files in batch
 * @param assets - Array of ImagePicker assets
 * @param reportId - ID of the report
 * @returns Batch upload result
 */
export async function uploadMediaBatch(
  assets: any[],
  reportId: string
): Promise<BatchUploadResult> {
  const result: BatchUploadResult = {
    success: true,
    uploadedUrls: [],
    failedCount: 0,
    errors: []
  };

  try {
    console.log(`📁 Starting batch upload of ${assets.length} files for report ${reportId}`);

    // Upload files sequentially to avoid overwhelming the network
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      console.log(`📤 Uploading file ${i + 1}/${assets.length}`);

      const uploadResult = await uploadMediaFile(asset, reportId);

      if (uploadResult.success && uploadResult.url) {
        result.uploadedUrls.push(uploadResult.url);
        console.log(`✅ File ${i + 1} uploaded successfully`);
      } else {
        result.failedCount++;
        const errorMessage = uploadResult.error || `Failed to upload file ${i + 1}`;
        result.errors.push(errorMessage);
        console.error(`❌ File ${i + 1} upload failed:`, errorMessage);
      }

      // Add small delay between uploads
      if (i < assets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    result.success = result.failedCount === 0;

    if (result.success) {
      console.log(`✅ All ${assets.length} files uploaded successfully for report ${reportId}`);
    } else {
      console.warn(`⚠️ Batch upload completed with ${result.failedCount} failures for report ${reportId}`);
    }

    return result;
  } catch (error: any) {
    await logAppError(error, 'uploadMediaBatch', { reportId, fileCount: assets.length });

    return {
      success: false,
      uploadedUrls: [],
      failedCount: assets.length,
      errors: [error.message || 'Batch upload failed']
    };
  }
}

/**
 * Get file information from asset
 * @param asset - ImagePicker asset
 * @returns File information
 */
export async function getFileInfo(asset: any): Promise<{
  name: string;
  size: number;
  type: string;
  width: number;
  height: number;
}> {
  try {
    // Get file info using FileSystem
    const fileInfo = await FileSystem.getInfoAsync(asset.uri);

    // Type guard: check if file exists before accessing size
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    return {
      name: asset.fileName || `image_${Date.now()}.jpg`,
      size: fileInfo.size,
      type: asset.type || 'image/jpeg',
      width: asset.width || 0,
      height: asset.height || 0
    };
  } catch (error) {
    console.error('Error getting file info:', error);
    return {
      name: `image_${Date.now()}.jpg`,
      size: 0,
      type: 'image/jpeg',
      width: 0,
      height: 0
    };
  }
}

/**
 * Validate media file before upload
 * @param asset - ImagePicker asset
 * @returns Validation result
 */
export function validateMediaFile(asset: any): { valid: boolean; error?: string } {
  try {
    // Check if asset exists
    if (!asset || !asset.uri) {
      return { valid: false, error: 'Invalid media file' };
    }

    // Check file type
    if (asset.type && !ACCEPTED_MEDIA_TYPES.includes(asset.type.toLowerCase())) {
      return { valid: false, error: 'Unsupported file type. Please use JPEG, PNG, HEIC, MP4, or MOV files.' };
    }

    // Check file size if available
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE_BYTES) {
      return { valid: false, error: `File size exceeds the maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.` };
    }

    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message || 'File validation failed' };
  }
}