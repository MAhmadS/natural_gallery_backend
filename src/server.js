import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { initQdrant } from './config/qdrant.js';
import { initAIModel } from './services/aiService.js';
import storageService from './services/storageService.js';
import authRoutes from './routes/authRoutes.js';
import imageRoutes from './routes/imageRoutes.js';
// import collectionRoutes from './routes/collectionRoutes.js'; // Disabled for now

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/images', imageRoutes);
// app.use('/api/collections', collectionRoutes); // Disabled for now

// Health check route with service status
app.get('/health', async (req, res) => {
  const { isMongoDBConnected } = await import('./config/database.js');
  const { isQdrantConnected, checkQdrantHealth } = await import('./config/qdrant.js');
  const { isAIModelReady } = await import('./services/aiService.js');
  
  const mongoStatus = isMongoDBConnected();
  const qdrantStatus = isQdrantConnected() && await checkQdrantHealth();
  const aiModelStatus = isAIModelReady();
  
  const allCriticalServicesUp = mongoStatus && aiModelStatus;
  
  res.status(allCriticalServicesUp ? 200 : 503).json({
    success: allCriticalServicesUp,
    message: allCriticalServicesUp ? 'SmartGallery API is running' : 'Some services are unavailable',
    services: {
      database: {
        status: mongoStatus ? 'connected' : 'disconnected',
        critical: true,
      },
      aiModel: {
        status: aiModelStatus ? 'ready' : 'unavailable',
        critical: true,
        note: aiModelStatus ? null : 'Image uploads disabled',
      },
      vectorDB: {
        status: qdrantStatus ? 'connected' : 'disconnected',
        critical: false,
        note: qdrantStatus ? null : 'AI search disabled, text search available',
      },
    },
    features: {
      imageUpload: mongoStatus && aiModelStatus,
      imageView: mongoStatus,
      aiSearch: mongoStatus && qdrantStatus,
      textSearch: mongoStatus,
    },
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Server Error',
  });
});

// Initialize services and start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to MongoDB (critical service)
    await connectDB();
    
    // Initialize storage (critical service - requires Vercel Blob)
    await storageService.initialize();
    
    // Initialize Qdrant (optional service)
    await initQdrant().catch(err => {
      console.warn('Starting server without Qdrant...');
    });
    
    // Initialize AI model (for embeddings - non-blocking)
    console.log('Initializing AI model (this may take a moment)...');
    const aiModelLoaded = await initAIModel();
    if (!aiModelLoaded) {
      console.warn('⚠️  AI model initialization failed.');
      console.warn('⚠️  Images will be uploaded without embeddings.');
      console.warn('⚠️  Background processor will embed images when model is available.');
      console.warn('⚠️  Search will be limited to text-based matching.');
    } else {
      // Start background embedding processor when model is ready
      const { startEmbeddingProcessor } = await import('./services/embeddingProcessor.js');
      startEmbeddingProcessor();
    }
    
    // Start server
    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on port ${PORT}`);
      console.log(`📍 API: http://localhost:${PORT}`);
      
      if (aiModelLoaded) {
        console.log(`✅ All services operational - ready for requests\n`);
      } else {
        console.log(`⚠️  Server running - uploads enabled, AI search limited\n`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

startServer();

export default app;
