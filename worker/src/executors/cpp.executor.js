const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TIMEOUT_MS = 3000;
const DOCKER_IMAGE = 'gcc:latest';

/**
 * Wrap user code inside a controlled main() / solve() template.
 * The user implements the body of solve(); we control entry point.
 */
function generateWrappedCode(userCode) {
    return `
#include <bits/stdc++.h>
using namespace std;

// --- user code start ---
${userCode}
// --- user code end ---

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    solve();
    return 0;
}
`;
}

/**
 * Run a child process and collect stdout/stderr.
 * Resolves with { code, stdout, stderr } or rejects on timeout.
 */
function runProcess(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            ...options,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        let killed = false;
        const timer = setTimeout(() => {
            killed = true;
            proc.kill('SIGKILL');
        }, options.timeout || TIMEOUT_MS);

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (killed) {
                return reject(new Error('TIME_LIMIT_EXCEEDED'));
            }
            resolve({ code, stdout, stderr });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });

        // Close stdin immediately – we don't pipe any input yet
        proc.stdin.end();
    });
}

/**
 * Create a unique temporary working directory, returning its path.
 */
function createTempDir() {
    
    return fs.mkdtempSync(path.join(os.tmpdir(), 'algoscale-cpp-'));
}

/**
 * Remove a directory and all its contents.
 */
function cleanupDir(dirPath) {
    try {
        fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
        // Best-effort cleanup; ignore errors
    }
}

/**
 * Compile user C++ code inside a Docker container.
 *
 * @param {string} workDir  – host path containing solution.cpp
 * @returns {Promise<{code, stdout, stderr}>}
 */
function compile(workDir) {
    const args = [
        'run',
        '--rm',
        '--network=none',
        '--memory=128m',
        '--cpus=0.5',
        '--pids-limit=64',
        '-v', `${workDir}:/workspace`,
        '-w', '/workspace',
        DOCKER_IMAGE,
        'g++',
        '-o', 'solution',
        '-std=c++17',
        '-O2',
        'solution.cpp',
    ];

    return runProcess('docker', args, { timeout: TIMEOUT_MS });
}

/**
 * Run the compiled binary inside a Docker container with strict security flags.
 *
 * @param {string} workDir  – host path containing the compiled binary
 * @returns {Promise<{code, stdout, stderr}>}
 */
function execute(workDir) {
    const args = [
        'run',
        '--rm',
        '--network=none',
        '--memory=128m',
        '--cpus=0.5',
        '--pids-limit=64',
        '--read-only',
        '-v', `${workDir}:/workspace:ro`,
        '-w', '/workspace',
        DOCKER_IMAGE,
        './solution',
    ];

    return runProcess('docker', args, { timeout: TIMEOUT_MS });
}

/**
 * Main entry point – compile and run a C++ submission.
 *
 * @param {string} code – raw user code (body of solve())
 * @returns {Promise<{success: boolean, stdout: string, stderr: string, executionTime: number}>}
 */
async function executeCpp(code) {
    
    const workDir = createTempDir();
    
    try {
        // 1. Write the wrapped source file
        const wrappedCode = generateWrappedCode(code);
        fs.writeFileSync(path.join(workDir, 'solution.cpp'), wrappedCode);
        console.log("Execution started : ");

        // 2. Compile
        const compileResult = await compile(workDir);
        console.log("Executing..");

        if (compileResult.code !== 0) {
            return {
                success: false,
                stdout: '',
                stderr: compileResult.stderr || 'Compilation failed',
                executionTime: 0,
            };
        }

        // 3. Execute
        console.log("Almost there");
        const startTime = Date.now();
        const runResult = await execute(workDir);
        const executionTime = Date.now() - startTime;

        return {
            success: runResult.code === 0,
            stdout: runResult.stdout,
            stderr: runResult.stderr,
            executionTime,
        };
    } catch (err) {
        if (err.message === 'TIME_LIMIT_EXCEEDED') {
            return {
                success: false,
                stdout: '',
                stderr: 'Time Limit Exceeded (3s)',
                executionTime: TIMEOUT_MS,
            };
        }
        return {
            success: false,
            stdout: '',
            stderr: err.message || 'Unknown error',
            executionTime: 0,
        };
    } finally {
        cleanupDir(workDir);
    }
}

module.exports = { executeCpp };
