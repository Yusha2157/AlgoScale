require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');
const { redisClient } = require('./config/redis');

const PORT = process.env.PORT || 3000;

const start = async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`🚀 API server running on port ${PORT}`);
    });
};

// Graceful shutdown
const shutdown = async (signal) => {
    console.log(`\n⏹️  Received ${signal}. Shutting down gracefully...`);

    try {
        await redisClient.quit();
        console.log('Redis connection closed');
    } catch (err) {
        console.error('Error closing Redis:', err.message);
    }

    try {
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
    } catch (err) {
        console.error('Error closing MongoDB:', err.message);
    }

    process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
    console.error('❌ Failed to start API server:', err.message);
    process.exit(1);
});
