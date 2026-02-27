const express = require('express');
const mongoose = require('mongoose');
const Submission = require('../models/submission.model');
const submissionQueue = require('../queue/submission.queue');
const { redisClient } = require('../config/redis');

const router = express.Router();

// POST /submit — create a submission and enqueue it
router.post('/submit', async (req, res) => {
    try {
        const { language, code, problemId } = req.body;

        if (!language || !code || !problemId) {
            return res.status(400).json({
                error: 'Missing required fields: language, code, problemId',
            });
        }

        const submission = await Submission.create({
            language,
            code,
            problemId,
            status: 'pending',
        });

        await submissionQueue.add('process-submission', {
            submissionId: submission._id.toString(),
            language,
            code,
            problemId,
        });

        console.log(`📨 Submission ${submission._id} enqueued`);

        return res.status(201).json({
            id: submission._id,
            status: submission.status,
        });
    } catch (err) {
        console.error('❌ Submit error:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /health — check Redis + Mongo connectivity
router.get('/health', async (req, res) => {
    const health = { status: 'ok', redis: 'disconnected', mongo: 'disconnected' };

    try {
        const redisPing = await redisClient.ping();
        health.redis = redisPing === 'PONG' ? 'connected' : 'disconnected';
    } catch {
        health.redis = 'disconnected';
    }

    try {
        const mongoState = mongoose.connection.readyState;
        health.mongo = mongoState === 1 ? 'connected' : 'disconnected';
    } catch {
        health.mongo = 'disconnected';
    }

    const overallOk = health.redis === 'connected' && health.mongo === 'connected';
    health.status = overallOk ? 'ok' : 'degraded';

    return res.status(overallOk ? 200 : 503).json(health);
});

module.exports = router;
