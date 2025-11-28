import mongoose from 'mongoose';

let isMongoConnected = false;

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isMongoConnected = true;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('disconnected', () => {
      isMongoConnected = false;
      console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
    });
    
    mongoose.connection.on('reconnected', () => {
      isMongoConnected = true;
      console.log('✅ MongoDB reconnected successfully');
    });
    
    mongoose.connection.on('error', (err) => {
      isMongoConnected = false;
      console.error('❌ MongoDB error:', err.message);
    });
    
  } catch (error) {
    isMongoConnected = false;
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    console.error('❌ Application cannot function without database');
    process.exit(1);
  }
};

export const isMongoDBConnected = () => {
  return isMongoConnected && mongoose.connection.readyState === 1;
};

export default connectDB;
