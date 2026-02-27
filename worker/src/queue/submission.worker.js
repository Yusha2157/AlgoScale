const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis');

const createWorker = () => {
    const worker = new Worker(
        'submission-queue',
        async (job) => {
            console.log(`📥 Job received: ${job.id}`);
            console.log(`   Data:`, JSON.stringify(job.data, null, 2));

            // Simulate processing (1 second delay)
            await new Promise((resolve) => setTimeout(resolve, 1000));

            console.log(`✅ Job ${job.id} completed`);
            return { success: true };
        },
        { connection: redisConnection }
    );

    worker.on('completed', (job) => {
        console.log(`🎉 Job ${job.id} has been completed`);
    });

    worker.on('failed', (job, err) => {
        console.error(`❌ Job ${job?.id} failed:`, err.message);
    });

    worker.on('error', (err) => {
        console.error('❌ Worker error:', err.message);
    });

    return worker;
};

module.exports = createWorker;
