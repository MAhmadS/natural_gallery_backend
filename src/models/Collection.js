import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Collection name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    images: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Image',
    }],
    isPublic: {
      type: Boolean,
      default: false,
    },
    coverImage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Image',
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
collectionSchema.index({ user: 1, createdAt: -1 });

const Collection = mongoose.model('Collection', collectionSchema);

export default Collection;
