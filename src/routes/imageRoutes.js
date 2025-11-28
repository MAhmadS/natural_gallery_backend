import express from 'express';
import multer from 'multer';
import {
  uploadImage,
  uploadMultipleImages,
  getImages,
  getImage,
  updateImage,
  deleteImage,
  searchImages,
} from '../controllers/imageController.js';
import { protect } from '../middleware/auth.js';
import { uploadSingle, uploadMultiple } from '../middleware/upload.js';
import { checkCriticalServices, checkAIModel, getServiceStatus } from '../middleware/serviceHealth.js';

const router = express.Router();

// Public routes (no auth required)
// Service status endpoint - must be before auth middleware
router.get('/service-status', async (req, res) => {
  const status = await getServiceStatus();
  res.json({
    success: true,
    status,
  });
});

// All routes below require authentication
router.use(protect);

// All routes require database connection
router.use(checkCriticalServices);

// Error handler for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 10MB per file.',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 20 files at once.',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.field) {
      return res.status(400).json({
        success: false,
        message: `Unexpected field "${err.field}". Use "image" for single upload or "images" for multiple uploads.`,
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload error',
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Upload error',
    });
  }
  next();
};

// Routes
router.post('/upload', uploadSingle, handleMulterError, uploadImage);
router.post('/upload-multiple', uploadMultiple, handleMulterError, uploadMultipleImages);
router.get('/', getImages);
router.get('/:id', getImage);
router.put('/:id', updateImage);
router.delete('/:id', deleteImage);
router.post('/search', searchImages);

// Embedding stats endpoint
router.get('/stats/embeddings', async (req, res) => {
  try {
    const { getEmbeddingStats } = await import('../services/embeddingProcessor.js');
    const stats = await getEmbeddingStats(req.user._id);
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching embedding stats',
      error: error.message,
    });
  }
});

export default router;
