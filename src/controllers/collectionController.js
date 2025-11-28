import Collection from '../models/Collection.js';
import Image from '../models/Image.js';

/**
 * @desc    Create collection
 * @route   POST /api/collections
 * @access  Private
 */
export const createCollection = async (req, res) => {
  try {
    const { name, description, isPublic } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a collection name',
      });
    }

    const collection = await Collection.create({
      name,
      description: description || '',
      user: req.user._id,
      isPublic: isPublic || false,
    });

    res.status(201).json({
      success: true,
      collection,
    });
  } catch (error) {
    console.error('Create collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating collection',
    });
  }
};

/**
 * @desc    Get all collections for user
 * @route   GET /api/collections
 * @access  Private
 */
export const getCollections = async (req, res) => {
  try {
    const collections = await Collection.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate('coverImage', 'filename filePath')
      .populate('images', 'filename filePath title');

    res.json({
      success: true,
      collections,
    });
  } catch (error) {
    console.error('Get collections error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching collections',
    });
  }
};

/**
 * @desc    Get single collection
 * @route   GET /api/collections/:id
 * @access  Private
 */
export const getCollection = async (req, res) => {
  try {
    const collection = await Collection.findById(req.params.id)
      .populate('images')
      .populate('coverImage', 'filename filePath');

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found',
      });
    }

    // Check ownership or public access
    if (collection.user.toString() !== req.user._id.toString() && !collection.isPublic) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this collection',
      });
    }

    res.json({
      success: true,
      collection,
    });
  } catch (error) {
    console.error('Get collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching collection',
    });
  }
};

/**
 * @desc    Update collection
 * @route   PUT /api/collections/:id
 * @access  Private
 */
export const updateCollection = async (req, res) => {
  try {
    const { name, description, isPublic, coverImage } = req.body;

    let collection = await Collection.findById(req.params.id);

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found',
      });
    }

    // Check ownership
    if (collection.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this collection',
      });
    }

    // Update fields
    if (name !== undefined) collection.name = name;
    if (description !== undefined) collection.description = description;
    if (isPublic !== undefined) collection.isPublic = isPublic;
    if (coverImage !== undefined) collection.coverImage = coverImage;

    await collection.save();

    res.json({
      success: true,
      collection,
    });
  } catch (error) {
    console.error('Update collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating collection',
    });
  }
};

/**
 * @desc    Delete collection
 * @route   DELETE /api/collections/:id
 * @access  Private
 */
export const deleteCollection = async (req, res) => {
  try {
    const collection = await Collection.findById(req.params.id);

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found',
      });
    }

    // Check ownership
    if (collection.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this collection',
      });
    }

    // Remove collection reference from images
    await Image.updateMany(
      { _id: { $in: collection.images } },
      { $pull: { collections: collection._id } }
    );

    await collection.deleteOne();

    res.json({
      success: true,
      message: 'Collection deleted successfully',
    });
  } catch (error) {
    console.error('Delete collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting collection',
    });
  }
};

/**
 * @desc    Add image to collection
 * @route   POST /api/collections/:id/images/:imageId
 * @access  Private
 */
export const addImageToCollection = async (req, res) => {
  try {
    const { id, imageId } = req.params;

    const collection = await Collection.findById(id);
    const image = await Image.findById(imageId);

    if (!collection || !image) {
      return res.status(404).json({
        success: false,
        message: 'Collection or image not found',
      });
    }

    // Check ownership
    if (collection.user.toString() !== req.user._id.toString() ||
        image.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized',
      });
    }

    // Check if image is already in collection
    if (collection.images.includes(imageId)) {
      return res.status(400).json({
        success: false,
        message: 'Image already in collection',
      });
    }

    // Add image to collection
    collection.images.push(imageId);
    await collection.save();

    // Add collection to image
    image.collections.push(id);
    await image.save();

    res.json({
      success: true,
      collection,
    });
  } catch (error) {
    console.error('Add image to collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding image to collection',
    });
  }
};

/**
 * @desc    Remove image from collection
 * @route   DELETE /api/collections/:id/images/:imageId
 * @access  Private
 */
export const removeImageFromCollection = async (req, res) => {
  try {
    const { id, imageId } = req.params;

    const collection = await Collection.findById(id);

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found',
      });
    }

    // Check ownership
    if (collection.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized',
      });
    }

    // Remove image from collection
    collection.images = collection.images.filter(
      img => img.toString() !== imageId
    );
    await collection.save();

    // Remove collection from image
    await Image.findByIdAndUpdate(imageId, {
      $pull: { collections: id },
    });

    res.json({
      success: true,
      collection,
    });
  } catch (error) {
    console.error('Remove image from collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing image from collection',
    });
  }
};

export default {
  createCollection,
  getCollections,
  getCollection,
  updateCollection,
  deleteCollection,
  addImageToCollection,
  removeImageFromCollection,
};
