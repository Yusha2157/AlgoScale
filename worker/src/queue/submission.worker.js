const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis');
const { executeCpp } = require('../executors/cpp.executor');

// ANSI color helpers for clean, readable terminal output
const color = {
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    dim: (text) => `\x1b[2m${text}\x1b[0m`,
};

const createWorker = () => {
    const worker = new Worker(
        'submission-queue',
        async (job) => {
            const { submissionId, language, code, problemId } = job.data;

            console.log(color.cyan(`[Job ${job.id}] Received`));
            console.log(color.dim(`  Submission: ${submissionId} | Problem: ${problemId} | Language: ${language}`));

            // Only C++ is supported at this stage; reject anything else early
            if (language !== 'cpp') {
                throw new Error(`Unsupported language: "${language}". Only "cpp" is currently supported.`);
            }

            // Hand off the user code to the sandboxed C++ executor
            const result = await executeCpp(code);

            // Log a concise summary of the execution outcome
            if (result.success) {
                console.log(color.green(`[Job ${job.id}] Execution succeeded`));
            } else {
                console.log(color.red(`[Job ${job.id}] Execution failed`));
                console.log(color.yellow(`Error message : ${result.stderr}`));
            }

            console.log(color.dim(`  Time: ${result.executionTime}ms | stdout: ${result.stdout.length} chars | stderr: ${result.stderr.length} chars`));

            return result;
        },
        { connection: redisConnection }
    );

    // --- Event listeners (unchanged) ---

    worker.on('completed', (job) => {
        console.log(color.green(`[Job ${job.id}] Completed successfully`));
    });

    worker.on('failed', (job, err) => {
        console.error(color.red(`[Job ${job?.id}] Failed: ${err.message}`));
    });

    worker.on('error', (err) => {
        console.error(color.red(`[Worker] Error: ${err.message}`));
    });

    return worker;
};

module.exports = createWorker;
