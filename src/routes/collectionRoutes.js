import express from 'express';
import {
  createCollection,
  getCollections,
  getCollection,
  updateCollection,
  deleteCollection,
  addImageToCollection,
  removeImageFromCollection,
} from '../controllers/collectionController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Routes
router.post('/', createCollection);
router.get('/', getCollections);
router.get('/:id', getCollection);
router.put('/:id', updateCollection);
router.delete('/:id', deleteCollection);
router.post('/:id/images/:imageId', addImageToCollection);
router.delete('/:id/images/:imageId', removeImageFromCollection);

export default router;
