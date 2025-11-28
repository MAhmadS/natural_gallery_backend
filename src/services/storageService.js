import { put, del } from '@vercel/blob';

/**
 * Storage Service - Vercel Blob Storage only
 * No local file storage support
 */
class StorageService {
  constructor() {
    // Don't check here - env vars not loaded yet
  }

  /**
   * Initialize storage
   */
  async initialize() {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      const error = new Error(
        'BLOB_READ_WRITE_TOKEN is required. Get your token from https://vercel.com/dashboard/stores'
      );
      console.error('❌ Storage initialization failed:', error.message);
      throw error;
    }
    
    console.log('✅ Using Vercel Blob Storage');
    console.log(`📦 Token: ${process.env.BLOB_READ_WRITE_TOKEN.substring(0, 20)}...`);
  }

  /**
   * Save file to storage
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} filename - Filename to save as
   * @returns {Promise<string>} - URL to saved file
   */
  async saveFile(fileBuffer, filename) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN is required');
    }

    try {
      const blob = await put(filename, fileBuffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return blob.url;
    } catch (error) {
      console.error('Error saving file to Vercel Blob:', error);
      throw error;
    }
  }

  /**
   * Get file from storage
   * @param {string} fileUrl - Full URL to file
   * @returns {Promise<Buffer>} - File buffer
   */
  async getFile(fileUrl) {
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('Failed to fetch from Vercel Blob');
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('Error reading file from Vercel Blob:', error);
      throw error;
    }
  }

  /**
   * Delete file from storage
   * @param {string} fileUrl - Full URL to file
   * @returns {Promise<void>}
   */
  async deleteFile(fileUrl) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN is required');
    }
    
    try {
      await del(fileUrl, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
    } catch (error) {
      console.error('Error deleting file from Vercel Blob:', error);
      throw error;
    }
  }

  /**
   * Get full URL to file
   * @param {string} fileUrl - Full URL to file
   * @returns {string} - Full URL
   */
  getFullPath(fileUrl) {
    return fileUrl; // Always returns URL from Vercel Blob
  }

  /**
   * Get public URL for file
   * @param {string} fileUrl - Full URL to file
   * @returns {string} - Public URL
   */
  getPublicUrl(fileUrl) {
    return fileUrl; // Always returns URL from Vercel Blob
  }
}

// Export singleton instance
export default new StorageService();
