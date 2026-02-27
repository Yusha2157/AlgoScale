const express = require('express');
const submissionRoutes = require('./routes/submission.routes');

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/', submissionRoutes);

module.exports = app;
