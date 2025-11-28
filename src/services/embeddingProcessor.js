import Image from '../models/Image.js';
import { generateImageEmbedding, isAIModelReady } from './aiService.js';
import { getQdrantClient, isQdrantConnected, checkQdrantHealth } from '../config/qdrant.js';

const MAX_EMBEDDING_ATTEMPTS = 5;
const RETRY_DELAY = 60000; // 1 minute
let isProcessing = false;
let processingInterval = null;

/**
 * Process a single image for embedding
 */
const processImageEmbedding = async (image) => {
  try {
    console.log(`Processing embedding for image: ${image._id}`);
    
    // Update status to processing
    await Image.findByIdAndUpdate(image._id, {
      embeddingStatus: 'processing',
      lastEmbeddingAttempt: new Date(),
      $inc: { embeddingAttempts: 1 },
    });

    // Generate embedding
    const embedding = await generateImageEmbedding(image.filePath);
    
    // Store in Qdrant if available
    if (isQdrantConnected()) {
      await checkQdrantHealth();
      const qdrant = getQdrantClient();
      
      if (qdrant) {
        await qdrant.upsert(process.env.QDRANT_COLLECTION, {
          wait: true,
          points: [
            {
              id: image.qdrantId,
              vector: embedding,
              payload: {
                imageId: image._id.toString(),
                userId: image.user.toString(),
                filename: image.filename,
              },
            },
          ],
        });
      }
    }

    // Mark as completed
    await Image.findByIdAndUpdate(image._id, {
      isEmbedded: true,
      embeddingStatus: 'completed',
      embeddingError: null,
    });

    console.log(`✅ Embedding completed for image: ${image._id}`);
    return true;
  } catch (error) {
    console.error(`❌ Embedding failed for image ${image._id}:`, error.message);
    
    // Update with error
    await Image.findByIdAndUpdate(image._id, {
      embeddingStatus: 'failed',
      embeddingError: error.message,
    });

    return false;
  }
};

/**
 * Process all pending embeddings
 */
export const processPendingEmbeddings = async () => {
  if (isProcessing) {
    console.log('Embedding processor already running, skipping...');
    return;
  }

  if (!isAIModelReady()) {
    console.log('AI model not ready, skipping embedding processing');
    return;
  }

  isProcessing = true;

  try {
    // Find images that need embedding
    const imagesToProcess = await Image.find({
      $or: [
        { embeddingStatus: 'pending' },
        {
          embeddingStatus: 'failed',
          embeddingAttempts: { $lt: MAX_EMBEDDING_ATTEMPTS },
          $or: [
            { lastEmbeddingAttempt: { $exists: false } },
            { lastEmbeddingAttempt: { $lt: new Date(Date.now() - RETRY_DELAY) } },
          ],
        },
      ],
    }).limit(10); // Process 10 at a time

    if (imagesToProcess.length === 0) {
      console.log('No pending embeddings to process');
      isProcessing = false;
      return;
    }

    console.log(`📊 Processing ${imagesToProcess.length} pending embeddings...`);

    // Process images sequentially to avoid overloading
    let successCount = 0;
    let failCount = 0;

    for (const image of imagesToProcess) {
      const success = await processImageEmbedding(image);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    console.log(`✅ Embedding batch complete: ${successCount} succeeded, ${failCount} failed`);

    // Get remaining count
    const remainingCount = await Image.countDocuments({
      embeddingStatus: { $in: ['pending', 'failed'] },
      embeddingAttempts: { $lt: MAX_EMBEDDING_ATTEMPTS },
    });

    if (remainingCount > 0) {
      console.log(`📊 ${remainingCount} images still need embedding`);
    }
  } catch (error) {
    console.error('Error in embedding processor:', error);
  } finally {
    isProcessing = false;
  }
};

/**
 * Start the background embedding processor
 */
export const startEmbeddingProcessor = () => {
  if (processingInterval) {
    console.log('Embedding processor already started');
    return;
  }

  console.log('🚀 Starting background embedding processor...');
  
  // Process immediately
  processPendingEmbeddings();
  
  // Then process every 2 minutes
  processingInterval = setInterval(() => {
    processPendingEmbeddings();
  }, 120000); // 2 minutes
};

/**
 * Stop the background embedding processor
 */
export const stopEmbeddingProcessor = () => {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
    console.log('Embedding processor stopped');
  }
};

/**
 * Get embedding statistics
 */
export const getEmbeddingStats = async (userId) => {
  const query = userId ? { user: userId } : {};
  
  const [total, embedded, pending, processing, failed] = await Promise.all([
    Image.countDocuments(query),
    Image.countDocuments({ ...query, isEmbedded: true }),
    Image.countDocuments({ ...query, embeddingStatus: 'pending' }),
    Image.countDocuments({ ...query, embeddingStatus: 'processing' }),
    Image.countDocuments({ ...query, embeddingStatus: 'failed', embeddingAttempts: { $lt: MAX_EMBEDDING_ATTEMPTS } }),
  ]);

  return {
    total,
    embedded,
    pending,
    processing,
    failed,
    percentage: total > 0 ? Math.round((embedded / total) * 100) : 0,
  };
};

export default {
  processPendingEmbeddings,
  startEmbeddingProcessor,
  stopEmbeddingProcessor,
  getEmbeddingStats,
};
