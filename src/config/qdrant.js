import { QdrantClient } from '@qdrant/js-client-rest';

let qdrantClient = null;
let isQdrantAvailable = false;
let reconnectTimeout = null;
const RECONNECT_INTERVAL = 30000; // 30 seconds

export const initQdrant = async () => {
  try {
    // Configure Qdrant client with optional API key for Qdrant Cloud
    const config = { url: process.env.QDRANT_URL };
    
    // Add API key if provided (required for Qdrant Cloud)
    if (process.env.QDRANT_API_KEY) {
      config.apiKey = process.env.QDRANT_API_KEY;
      console.log('🔐 Using Qdrant Cloud with API key authentication');
    }
    
    qdrantClient = new QdrantClient(config);

    // Check if collection exists, if not create it
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some(
      (col) => col.name === process.env.QDRANT_COLLECTION
    );

    if (!collectionExists) {
      await qdrantClient.createCollection(process.env.QDRANT_COLLECTION, {
        vectors: {
          size: 512, // CLIP ViT-B/32 embedding size
          distance: 'Cosine',
        },
      });
      console.log(`✅ Qdrant collection '${process.env.QDRANT_COLLECTION}' created`);
    }

    isQdrantAvailable = true;
    console.log('✅ Qdrant Connected');
    return qdrantClient;
  } catch (error) {
    isQdrantAvailable = false;
    console.warn('⚠️  Qdrant connection failed:', error.message);
    console.warn('⚠️  AI search features will be disabled. Other features will work normally.');
    console.warn('⚠️  Will attempt to reconnect in 30 seconds...');
    
    // Schedule reconnection attempt
    scheduleReconnect();
    
    return null;
  }
};

const scheduleReconnect = () => {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  
  reconnectTimeout = setTimeout(async () => {
    console.log('🔄 Attempting to reconnect to Qdrant...');
    await initQdrant();
  }, RECONNECT_INTERVAL);
};

export const getQdrantClient = () => {
  return qdrantClient;
};

export const isQdrantConnected = () => {
  return isQdrantAvailable;
};

export const checkQdrantHealth = async () => {
  if (!qdrantClient) {
    return false;
  }
  
  try {
    await qdrantClient.getCollections();
    if (!isQdrantAvailable) {
      isQdrantAvailable = true;
      console.log('✅ Qdrant reconnected successfully');
    }
    return true;
  } catch (error) {
    if (isQdrantAvailable) {
      isQdrantAvailable = false;
      console.warn('⚠️  Qdrant connection lost. Scheduling reconnect...');
      scheduleReconnect();
    }
    return false;
  }
};

export default { initQdrant, getQdrantClient, isQdrantConnected, checkQdrantHealth };
