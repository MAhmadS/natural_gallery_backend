import { env, AutoProcessor, AutoTokenizer, CLIPVisionModelWithProjection, CLIPTextModelWithProjection, RawImage } from '@xenova/transformers';
import fs from 'fs';

// Disable local model check for faster loading
env.allowLocalModels = false;

let visionModel = null;
let textModel = null;
let processor = null;
let tokenizer = null;
let isAIModelAvailable = false;
let modelInitializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

/**
 * Initialize the AI model pipeline
 */
export const initAIModel = async () => {
  try {
    modelInitializationAttempts++;
    console.log(`Loading AI model (attempt ${modelInitializationAttempts}/${MAX_INIT_ATTEMPTS})...`);
    const modelName = process.env.EMBEDDING_MODEL || 'Xenova/clip-vit-base-patch32';
    
    // Load CLIP vision and text models separately
    visionModel = await CLIPVisionModelWithProjection.from_pretrained(modelName);
    textModel = await CLIPTextModelWithProjection.from_pretrained(modelName);
    processor = await AutoProcessor.from_pretrained(modelName);
    tokenizer = await AutoTokenizer.from_pretrained(modelName);
    
    isAIModelAvailable = true;
    console.log('✅ AI model loaded successfully');
    console.log('✅ Image uploads are now ENABLED');
    return true;
  } catch (error) {
    isAIModelAvailable = false;
    console.error('❌ Error loading AI model:', error.message);
    
    if (modelInitializationAttempts < MAX_INIT_ATTEMPTS) {
      console.warn(`⚠️  Will retry in 10 seconds...`);
      setTimeout(() => initAIModel(), 10000);
    } else {
      console.error('❌ AI model initialization failed after maximum attempts');
      console.error('❌ Image uploads will be DISABLED');
      console.error('❌ Search will be limited to text-based matching only');
    }
    return false;
  }
};

/**
 * Generate embeddings for an image
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<number[]>} - Image embedding vector
 */
export const generateImageEmbedding = async (imagePath) => {
  try {
    if (!visionModel || !processor) {
      throw new Error('AI model not initialized');
    }

    // Load and preprocess image
    const image = await RawImage.read(imagePath);
    const image_inputs = await processor(image);
    
    // Generate image embedding
    const { image_embeds } = await visionModel(image_inputs);
    
    // Convert to array
    const embedding = Array.from(image_embeds.data);
    
    return embedding;
  } catch (error) {
    console.error('Error generating image embedding:', error);
    throw error;
  }
};

/**
 * Generate embeddings for text (for semantic search)
 * @param {string} text - Text query
 * @returns {Promise<number[]>} - Text embedding vector
 */
export const generateTextEmbedding = async (text) => {
  try {
    if (!textModel || !tokenizer) {
      throw new Error('AI model not initialized');
    }

    // Tokenize text
    const text_inputs = await tokenizer(text, { padding: true, truncation: true });
    
    // Generate text embedding
    const { text_embeds } = await textModel(text_inputs);
    
    // Convert to array
    const embedding = Array.from(text_embeds.data);
    
    return embedding;
  } catch (error) {
    console.error('Error generating text embedding:', error);
    throw error;
  }
};

/**
 * Get metadata from image
 * @param {string} imagePath - Path or URL to the image file
 * @returns {Promise<object>} - Image metadata
 */
export const getImageMetadata = async (imagePath) => {
  try {
    // Load image using RawImage - it can handle both URLs and local paths
    const image = await RawImage.read(imagePath);
    
    // Get file size if it's a local path
    let fileSize;
    if (!imagePath.startsWith('http://') && !imagePath.startsWith('https://')) {
      const stats = fs.statSync(imagePath);
      fileSize = stats.size;
    }
    
    return {
      width: image.width,
      height: image.height,
      format: 'image',
      fileSize: fileSize,
    };
  } catch (error) {
    console.error('Error getting image metadata:', error);
    console.error('Image path:', imagePath);
    // Throw error so it can be handled properly upstream
    throw new Error(`Failed to get image metadata: ${error.message}`);
  }
};

/**
 * Check if AI model is available
 */
export const isAIModelReady = () => {
  const ready = isAIModelAvailable && visionModel && textModel && processor && tokenizer;
  return ready;
};

export default {
  initAIModel,
  generateImageEmbedding,
  generateTextEmbedding,
  getImageMetadata,
  isAIModelReady,
};
