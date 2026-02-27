const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
    language: {
        type: String,
        required: true,
    },
    code: {
        type: String,
        required: true,
    },
    problemId: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Submission', submissionSchema);
