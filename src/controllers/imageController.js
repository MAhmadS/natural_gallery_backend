import Image from '../models/Image.js';
import Collection from '../models/Collection.js';
import { getQdrantClient, isQdrantConnected, checkQdrantHealth } from '../config/qdrant.js';
import { generateImageEmbedding, generateTextEmbedding, getImageMetadata, isAIModelReady } from '../services/aiService.js';
import { isMongoDBConnected } from '../config/database.js';
import storageService from '../services/storageService.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

/**
 * @desc    Upload multiple images
 * @route   POST /api/images/upload-multiple
 * @access  Private
 */
export const uploadMultipleImages = async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (!isMongoDBConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Database is currently unavailable. Please try again later.',
      });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please upload at least one image',
      });
    }

    const uploadedImages = [];
    const errors = [];
    const aiModelAvailable = isAIModelReady();

    // Process each file
    for (const file of req.files) {
      try {
        // Generate unique filename
        const fileExt = path.extname(file.originalname);
        const filename = `${uuidv4()}${fileExt}`;

        // Save file to storage
        const filePath = await storageService.saveFile(file.buffer, filename);
        const fullPath = storageService.getFullPath(filePath);

        // Get image metadata
        const metadata = await getImageMetadata(fullPath);

        // Generate Qdrant ID
        const qdrantId = uuidv4();

        let embeddingStatus = 'pending';
        let isEmbedded = false;

        // Try to generate embedding immediately if AI model is available
        if (aiModelAvailable && isQdrantConnected()) {
          try {
            await checkQdrantHealth();
            const embedding = await generateImageEmbedding(fullPath);
            const qdrant = getQdrantClient();
            
            if (qdrant) {
              await qdrant.upsert(process.env.QDRANT_COLLECTION, {
                wait: true,
                points: [
                  {
                    id: qdrantId,
                    vector: embedding,
                    payload: {
                      imageId: null,
                      userId: req.user._id.toString(),
                      filename,
                    },
                  },
                ],
              });
              embeddingStatus = 'completed';
              isEmbedded = true;
            }
          } catch (error) {
            console.warn('⚠️  Failed to store embedding, will retry later:', error.message);
            embeddingStatus = 'pending';
          }
        }

        // Create image document with auto-generated title from filename
        const titleWithoutExt = path.basename(file.originalname, fileExt);
        const image = await Image.create({
          filename,
          originalName: file.originalname,
          filePath,
          fileSize: file.size,
          mimeType: file.mimetype,
          width: metadata.width,
          height: metadata.height,
          title: titleWithoutExt,
          description: '',
          tags: [],
          qdrantId,
          user: req.user._id,
          isPublic: false,
          isEmbedded,
          embeddingStatus,
          embeddingAttempts: isEmbedded ? 1 : 0,
        });

        // Update Qdrant payload with MongoDB image ID (if embedded)
        if (isEmbedded && isQdrantConnected()) {
          try {
            const qdrant = getQdrantClient();
            if (qdrant) {
              await qdrant.setPayload(process.env.QDRANT_COLLECTION, {
                wait: true,
                points: [qdrantId],
                payload: {
                  imageId: image._id.toString(),
                },
              });
            }
          } catch (error) {
            console.warn('⚠️  Failed to update Qdrant payload:', error.message);
          }
        }

        uploadedImages.push(image);
      } catch (error) {
        console.error('Error uploading file:', file.originalname, error);
        errors.push({
          filename: file.originalname,
          error: error.message,
        });
      }
    }

    // Trigger background embedding processing if there are pending images
    const { processPendingEmbeddings } = await import('../services/embeddingProcessor.js');
    setImmediate(() => processPendingEmbeddings().catch(err => console.error('Background embedding error:', err)));

    res.status(201).json({
      success: true,
      images: uploadedImages,
      uploadedCount: uploadedImages.length,
      totalCount: req.files.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Upload multiple images error:', error);
    
    // Check if it's a storage configuration error
    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      return res.status(503).json({
        success: false,
        message: 'Storage service unavailable',
        error: 'Vercel Blob Storage is not configured. Image uploads require cloud storage in production.',
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error uploading images',
      error: error.message,
    });
  }
};

/**
 * @desc    Upload image
 * @route   POST /api/images/upload
 * @access  Private
 */
export const uploadImage = async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (!isMongoDBConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Database is currently unavailable. Please try again later.',
      });
    }
    
    // Check if AI model is available (required for embeddings)
    if (!isAIModelReady()) {
      return res.status(503).json({
        success: false,
        message: 'AI model is currently unavailable. Image uploads are temporarily disabled.',
        hint: 'Please try again in a few minutes or contact support if the issue persists.',
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image',
      });
    }

    const { title, description, tags, isPublic } = req.body;

    // Generate unique filename
    const fileExt = path.extname(req.file.originalname);
    const filename = `${uuidv4()}${fileExt}`;

    // Save file to storage
    const filePath = await storageService.saveFile(req.file.buffer, filename);
    const fullPath = storageService.getFullPath(filePath);

    // Get image metadata
    const metadata = await getImageMetadata(fullPath);

    // Generate Qdrant ID
    const qdrantId = uuidv4();

    // Try to store embedding in Qdrant if available
    if (isQdrantConnected()) {
      try {
        await checkQdrantHealth();
        const embedding = await generateImageEmbedding(fullPath);
        const qdrant = getQdrantClient();
        
        if (qdrant) {
          await qdrant.upsert(process.env.QDRANT_COLLECTION, {
            wait: true,
            points: [
              {
                id: qdrantId,
                vector: embedding,
                payload: {
                  imageId: null,
                  userId: req.user._id.toString(),
                  filename,
                },
              },
            ],
          });
        }
      } catch (error) {
        console.warn('⚠️  Failed to store embedding in Qdrant:', error.message);
        console.warn('⚠️  Image will be saved without AI search capability');
      }
    }

    // Create image document
    const image = await Image.create({
      filename,
      originalName: req.file.originalname,
      filePath,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      width: metadata.width,
      height: metadata.height,
      title: title || req.file.originalname,
      description: description || '',
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim())) : [],
      qdrantId,
      user: req.user._id,
      isPublic: isPublic === 'true',
    });

    // Update Qdrant payload with MongoDB image ID (if Qdrant is available)
    if (isQdrantConnected()) {
      try {
        const qdrant = getQdrantClient();
        if (qdrant) {
          await qdrant.setPayload(process.env.QDRANT_COLLECTION, {
            wait: true,
            points: [qdrantId],
            payload: {
              imageId: image._id.toString(),
            },
          });
        }
      } catch (error) {
        console.warn('⚠️  Failed to update Qdrant payload:', error.message);
      }
    }

    res.status(201).json({
      success: true,
      image,
    });
  } catch (error) {
    console.error('Upload image error:', error);
    
    // Check if it's a storage configuration error
    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      return res.status(503).json({
        success: false,
        message: 'Storage service unavailable',
        error: 'Vercel Blob Storage is not configured. Image uploads require cloud storage in production.',
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error uploading image',
      error: error.message,
    });
  }
};

/**
 * @desc    Get all images for user
 * @route   GET /api/images
 * @access  Private
 */
export const getImages = async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (!isMongoDBConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Database is currently unavailable. Please try again later.',
      });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const { startDate, endDate, location, name } = req.query;

    // Build filter query
    const filter = { user: req.user._id };
    
    // Date range filter
    if (startDate || endDate) {
      filter.uploadDate = {};
      if (startDate) filter.uploadDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.uploadDate.$lte = end;
      }
    }
    
    // Location filter (case-insensitive partial match)
    if (location) {
      filter.location = { $regex: location, $options: 'i' };
    }

    // Name filter (search in title and originalName, case-insensitive partial match)
    if (name) {
      filter.$or = [
        { title: { $regex: name, $options: 'i' } },
        { originalName: { $regex: name, $options: 'i' } },
      ];
    }

    const images = await Image.find(filter)
      .sort({ uploadDate: -1 })
      .skip(skip)
      .limit(limit)
      .populate('collections', 'name');

    const total = await Image.countDocuments(filter);

    res.json({
      success: true,
      images,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      filters: { startDate, endDate, location, name },
    });
  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching images',
    });
  }
};

/**
 * @desc    Get single image
 * @route   GET /api/images/:id
 * @access  Private
 */
export const getImage = async (req, res) => {
  try {
    const image = await Image.findById(req.params.id).populate('collections', 'name');

    if (!image) {
      return res.status(404).json({
        success: false,
        message: 'Image not found',
      });
    }

    // Check ownership or public access
    if (image.user.toString() !== req.user._id.toString() && !image.isPublic) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this image',
      });
    }

    res.json({
      success: true,
      image,
    });
  } catch (error) {
    console.error('Get image error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching image',
    });
  }
};

/**
 * @desc    Update image
 * @route   PUT /api/images/:id
 * @access  Private
 */
export const updateImage = async (req, res) => {
  try {
    const { title, description, tags, isPublic } = req.body;

    let image = await Image.findById(req.params.id);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: 'Image not found',
      });
    }

    // Check ownership
    if (image.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this image',
      });
    }

    // Update fields
    if (title !== undefined) image.title = title;
    if (description !== undefined) image.description = description;
    if (tags !== undefined) {
      image.tags = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
    }
    if (isPublic !== undefined) image.isPublic = isPublic;

    await image.save();

    res.json({
      success: true,
      image,
    });
  } catch (error) {
    console.error('Update image error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating image',
    });
  }
};

/**
 * @desc    Delete image
 * @route   DELETE /api/images/:id
 * @access  Private
 */
export const deleteImage = async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: 'Image not found',
      });
    }

    // Check ownership
    if (image.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this image',
      });
    }

    // Delete from Vercel Blob storage
    try {
      console.log(`Deleting file from storage: ${image.filePath}`);
      await storageService.deleteFile(image.filePath);
      console.log(`✅ File deleted from storage: ${image.filePath}`);
    } catch (error) {
      console.error('❌ Failed to delete file from storage:', error.message);
      // Continue with other deletions even if blob deletion fails
    }

    // Delete from Qdrant (if available)
    if (isQdrantConnected() && image.qdrantId) {
      try {
        const qdrant = getQdrantClient();
        if (qdrant) {
          await qdrant.delete(process.env.QDRANT_COLLECTION, {
            wait: true,
            points: [image.qdrantId],
          });
          console.log(`✅ Embedding deleted from Qdrant: ${image.qdrantId}`);
        }
      } catch (error) {
        console.warn('⚠️  Failed to delete from Qdrant:', error.message);
      }
    }

    // Remove from collections
    await Collection.updateMany(
      { images: image._id },
      { $pull: { images: image._id } }
    );

    // Delete from MongoDB
    await image.deleteOne();

    res.json({
      success: true,
      message: 'Image deleted successfully',
    });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting image',
      error: error.message,
    });
  }
};

/**
 * @desc    Search images by similarity or name
 * @route   POST /api/images/search
 * @access  Private
 */
export const searchImages = async (req, res) => {
  try {
    const { query, limit = 20, startDate, endDate, name } = req.body;

    // Build base filter
    const baseFilter = { user: req.user._id };

    // Apply date filter
    if (startDate || endDate) {
      baseFilter.uploadDate = {};
      if (startDate) baseFilter.uploadDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        baseFilter.uploadDate.$lte = end;
      }
    }

    // Apply name filter
    if (name) {
      baseFilter.$or = [
        { title: { $regex: name, $options: 'i' } },
        { originalName: { $regex: name, $options: 'i' } },
      ];
    }

    // If no query provided, return filtered images
    if (!query || !query.trim()) {
      const images = await Image.find(baseFilter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('collections', 'name');
      
      return res.json({
        success: true,
        query: '',
        images,
        count: images.length,
        searchType: 'all',
        message: 'Showing all images',
      });
    }

    // Check how many images are not yet embedded
    const unembeddedCount = await Image.countDocuments({
      user: req.user._id,
      isEmbedded: false,
    });

    // Check if Qdrant is available for AI search
    const useAISearch = isQdrantConnected() && await checkQdrantHealth() && isAIModelReady();

    let embedding = null; // Declare outside try block for error logging

    if (useAISearch) {
      try {
        // AI-powered semantic search with Qdrant (only searches embedded images)
        console.log('Generating text embedding for query:', query);
        embedding = await generateTextEmbedding(query);
        console.log('Embedding generated, length:', embedding.length);
        
        // Validate embedding
        if (!Array.isArray(embedding) || embedding.length === 0) {
          throw new Error('Invalid embedding generated');
        }
        
        const qdrant = getQdrantClient();
        console.log('Searching Qdrant collection:', process.env.QDRANT_COLLECTION);
        
        // Check if there are any points in the collection first
        const collectionInfo = await qdrant.getCollection(process.env.QDRANT_COLLECTION);
        console.log('Collection points count:', collectionInfo.points_count);
        
        if (collectionInfo.points_count === 0) {
          console.log('No points in collection, falling back to text search');
          throw new Error('No embedded images available for AI search');
        }
        
        // Search without filter (filter by userId in MongoDB instead since Qdrant doesn't have index)
        const searchResults = await qdrant.search(process.env.QDRANT_COLLECTION, {
          vector: embedding,
          limit: parseInt(limit) * 3, // Get more results to filter by user
          with_payload: true,
        });

        console.log('Qdrant search completed, results:', searchResults.length);

        // Get image details from MongoDB
        const imageIds = searchResults.map(result => result.payload.imageId).filter(id => id);
        
        if (imageIds.length === 0) {
          console.log('No matching images found in Qdrant, falling back to text search');
          throw new Error('No AI search results found');
        }
        
        // Filter by user and additional filters, get images from MongoDB
        const mongoFilter = { 
          _id: { $in: imageIds },
          ...baseFilter // Apply date and name filters
        };
        
        const images = await Image.find(mongoFilter)
          .populate('collections', 'name');

        // Sort images by Qdrant score and limit results
        const sortedImages = images
          .sort((a, b) => {
            const scoreA = searchResults.find(r => r.payload.imageId === a._id.toString())?.score || 0;
            const scoreB = searchResults.find(r => r.payload.imageId === b._id.toString())?.score || 0;
            return scoreB - scoreA;
          })
          .slice(0, parseInt(limit)); // Apply user's requested limit

        return res.json({
          success: true,
          query,
          images: sortedImages,
          count: sortedImages.length,
          searchType: 'ai',
          unembeddedCount,
          warning: unembeddedCount > 0 ? `${unembeddedCount} image(s) not yet indexed for AI search` : null,
        });
      } catch (error) {
        console.error('❌ AI search failed:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'), // Only first 3 lines of stack
          name: error.name,
          code: error.code,
          status: error.status,
          data: error.data,
          response: error.response?.data,
        });
        
        // Log embedding details for debugging
        if (embedding) {
          console.error('Embedding details:', {
            length: embedding.length,
            firstValues: embedding.slice(0, 5),
            type: typeof embedding[0],
          });
        }
        
        // If it's a Qdrant-specific error, return error to frontend
        if (error.message?.includes('Bad Request') || error.status === 400) {
          console.error('Qdrant Bad Request - possible causes:');
          console.error('1. Vector dimension mismatch (collection expects 512)');
          console.error('2. Invalid filter structure');
          console.error('3. Collection configuration issue');
          console.error('4. Embedding contains NaN or invalid values');
          
          return res.status(400).json({
            success: false,
            message: 'AI search failed. The search service may be experiencing issues.',
            error: 'Please try again later or contact support if the issue persists.',
            searchType: 'ai',
          });
        }
        
        // For other errors, return error (no fallback)
        return res.status(500).json({
          success: false,
          message: 'AI search encountered an error. Please try again later.',
          error: error.message,
          searchType: 'ai',
        });
      }
    }

    // If AI search is not available, return error
    return res.status(503).json({
      success: false,
      message: 'AI search is currently unavailable',
      error: 'AI model or vector database is not ready. Please use filters to browse images.',
      searchType: 'unavailable',
    });
  } catch (error) {
    console.error('Search images error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching images',
      error: error.message,
    });
  }
};

export default {
  uploadImage,
  uploadMultipleImages,
  getImages,
  getImage,
  updateImage,
  deleteImage,
  searchImages,
};
