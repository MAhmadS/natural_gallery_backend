import { isMongoDBConnected } from '../config/database.js';
import { isAIModelReady } from '../services/aiService.js';
import { isQdrantConnected, checkQdrantHealth } from '../config/qdrant.js';

/**
 * Middleware to check if critical services are available
 */
export const checkCriticalServices = (req, res, next) => {
  if (!isMongoDBConnected()) {
    return res.status(503).json({
      success: false,
      message: 'Database service is currently unavailable',
      error: 'SERVICE_UNAVAILABLE',
    });
  }
  next();
};

/**
 * Middleware to check if AI model is ready (for upload operations)
 * @deprecated - No longer blocks uploads, embeddings are processed async
 */
export const checkAIModel = (req, res, next) => {
  // No longer block uploads, just pass through
  next();
};

/**
 * Get current service status
 */
export const getServiceStatus = async () => {
  const mongoStatus = isMongoDBConnected();
  const aiModelStatus = isAIModelReady();
  const qdrantStatus = isQdrantConnected();
  
  let qdrantHealthy = false;
  if (qdrantStatus) {
    qdrantHealthy = await checkQdrantHealth();
  }
  
  // Get embedding stats
  const { getEmbeddingStats } = await import('../services/embeddingProcessor.js');
  const embeddingStats = await getEmbeddingStats();
  
  return {
    database: {
      available: mongoStatus,
      critical: true,
    },
    aiModel: {
      available: aiModelStatus ? true : false,
      critical: false,
      impact: aiModelStatus ? null : 'Images uploaded without embeddings (will be processed when available)',
    },
    vectorDB: {
      available: qdrantHealthy ? true : false,
      critical: false,
      impact: qdrantHealthy ? null : 'AI search disabled (text search still available)',
    },
    embedding: {
      total: embeddingStats.total,
      embedded: embeddingStats.embedded,
      pending: embeddingStats.pending,
      percentage: embeddingStats.percentage,
    },
    canUpload: mongoStatus ? true : false,
    canSearch: mongoStatus ? true : false,
    aiSearchAvailable: mongoStatus && qdrantHealthy && aiModelStatus ? true : false,
  };
};

export default {
  checkCriticalServices,
  checkAIModel,
  getServiceStatus,
};
