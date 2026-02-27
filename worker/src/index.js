require('dotenv').config();

const createWorker = require('./queue/submission.worker');
const { redisClient } = require('./config/redis');

console.log('🔄 Starting AlgoScale Worker...');

const worker = createWorker();

console.log('✅ Worker is listening for jobs on submission-queue');

// Graceful shutdown
const shutdown = async (signal) => {
    console.log(`\n⏹️  Received ${signal}. Shutting down gracefully...`);

    try {
        await worker.close();
        console.log('Worker closed');
    } catch (err) {
        console.error('Error closing worker:', err.message);
    }

    try {
        await redisClient.quit();
        console.log('Redis connection closed');
    } catch (err) {
        console.error('Error closing Redis:', err.message);
    }

    process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
