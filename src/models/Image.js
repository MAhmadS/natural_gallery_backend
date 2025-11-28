import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    width: {
      type: Number,
    },
    height: {
      type: Number,
    },
    title: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    tags: [{
      type: String,
      trim: true,
    }],
    qdrantId: {
      type: String,
      required: true,
      unique: true,
    },
    // Embedding status tracking
    isEmbedded: {
      type: Boolean,
      default: false,
    },
    embeddingStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    embeddingError: {
      type: String,
    },
    embeddingAttempts: {
      type: Number,
      default: 0,
    },
    lastEmbeddingAttempt: {
      type: Date,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    collections: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Collection',
    }],
    isPublic: {
      type: Boolean,
      default: false,
    },
    uploadDate: {
      type: Date,
      default: Date.now,
    },
    location: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for search optimization
imageSchema.index({ user: 1, createdAt: -1 });
imageSchema.index({ user: 1, uploadDate: -1 });
imageSchema.index({ tags: 1 });
imageSchema.index({ location: 1 });
imageSchema.index({ title: 'text', description: 'text', tags: 'text' });
imageSchema.index({ embeddingStatus: 1 });
imageSchema.index({ isEmbedded: 1, user: 1 });

const Image = mongoose.model('Image', imageSchema);

export default Image;
