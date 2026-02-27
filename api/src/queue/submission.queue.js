const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const submissionQueue = new Queue('submission-queue', {
    connection: redisConnection,
});

console.log('📋 Submission queue initialized');

module.exports = submissionQueue;
