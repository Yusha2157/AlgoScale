const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const COMPILE_TIMEOUT_MS = 10_000;  // 10 seconds for compilation
const RUN_TIMEOUT_MS = 3_000;   // 3 seconds for execution
const DOCKER_IMAGE = 'gcc:latest';
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB output cap


const CONTAINER_EXEC_DIR = '/execution';


const EXECUTION_VOLUME = process.env.EXECUTION_VOLUME || 'algoscale_execution-data';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap user code inside a controlled main()/solve() template. */
function generateWrappedCode(userCode) {
    return [
        '#include <bits/stdc++.h>',
        'using namespace std;',
        '',
        '// --- user code start ---',
        userCode,
        '// --- user code end ---',
        '',
        'int main() {',
        '    ios_base::sync_with_stdio(false);',
        '    cin.tie(NULL);',
        '    solve();',
        '    return 0;',
        '}',
        '',
    ].join('\n');
}

/** Create a unique run directory under /execution. */
function createRunDir() {
    fs.mkdirSync(CONTAINER_EXEC_DIR, { recursive: true });
    const id = crypto.randomBytes(8).toString('hex');
    const dir = path.join(CONTAINER_EXEC_DIR, `run-${id}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/** Best-effort cleanup of a run directory. */
function cleanupDir(dirPath) {
    try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch { /* ignore */ }
}

/**
 * Spawn a child process and collect stdout/stderr with bounded buffers.
 * Resolves with { code, stdout, stderr } or rejects with a tagged Error.
 */
function runProcess(command, args, { timeout, timeoutTag }) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

        let stdout = '';
        let stderr = '';
        let stdoutLen = 0;
        let stderrLen = 0;

        proc.stdout.on('data', (data) => {
            const chunk = data.toString();
            if (stdoutLen < MAX_OUTPUT_BYTES) {
                stdout += chunk.slice(0, MAX_OUTPUT_BYTES - stdoutLen);
                stdoutLen += chunk.length;
            }
        });

        proc.stderr.on('data', (data) => {
            const chunk = data.toString();
            if (stderrLen < MAX_OUTPUT_BYTES) {
                stderr += chunk.slice(0, MAX_OUTPUT_BYTES - stderrLen);
                stderrLen += chunk.length;
            }
        });

        let killed = false;
        const timer = setTimeout(() => {
            killed = true;
            proc.kill('SIGKILL');
        }, timeout);

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (killed) return reject(new Error(timeoutTag));
            resolve({ code, stdout, stderr });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });

        proc.stdin.end();
    });
}

// ---------------------------------------------------------------------------
// Docker compile & execute
// ---------------------------------------------------------------------------


function compile(runId) {
    const compileCmd = [
        `cd /volume/run-${runId}`,
        'echo "--- workspace listing ---"',
        'ls -la .',
        'echo "--- compiling ---"',
        'g++ -o solution -std=c++17 -O2 solution.cpp',
        'chmod +x solution',
    ].join(' && ');

    const args = [
        'run', '--rm',
        '--network=none',
        '--memory=256m',
        '--pids-limit=64',
        '-v', `${EXECUTION_VOLUME}:/volume`,
        DOCKER_IMAGE,
        'sh', '-c', compileCmd,
    ];

    return runProcess('docker', args, {
        timeout: COMPILE_TIMEOUT_MS,
        timeoutTag: 'COMPILE_TIMEOUT',
    });
}

/**
 * Run the compiled binary inside a Docker container with strict limits.
 */
function execute(runId) {
    const args = [
        'run', '--rm',
        '--network=none',
        '--memory=128m',
        '--cpus=0.5',
        '--pids-limit=64',
        '-v', `${EXECUTION_VOLUME}:/volume`,
        '-w', `/volume/run-${runId}`,
        DOCKER_IMAGE,
        './solution',
    ];

    return runProcess('docker', args, {
        timeout: RUN_TIMEOUT_MS,
        timeoutTag: 'RUNTIME_TIMEOUT',
    });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Compile and run a C++ submission.
 * @param {string} code  Raw user code (body of solve())
 * @returns {Promise<{success:boolean, stdout:string, stderr:string, executionTime:number}>}
 */
async function executeCpp(code) {
    if (!code || typeof code !== 'string') {
        return { success: false, stdout: '', stderr: 'No code provided', executionTime: 0 };
    }

    const runDir = createRunDir();
    // Extract the run-ID portion so sibling containers can reference the
    // subdirectory inside the named volume.
    const runId = path.basename(runDir).replace('run-', '');

    console.log(`[DIAG] workDir (container):  ${runDir}`);
    console.log(`[DIAG] volume name:          ${EXECUTION_VOLUME}`);
    console.log(`[DIAG] run ID:               ${runId}`);

    try {
        // ---- Write source file ------------------------------------------------
        const srcPath = path.join(runDir, 'solution.cpp');
        fs.writeFileSync(srcPath, generateWrappedCode(code));

        const srcExists = fs.existsSync(srcPath);
        console.log(`[DIAG] solution.cpp exists: ${srcExists}`);

        if (!srcExists) {
            return { success: false, stdout: '', stderr: 'Internal error: failed to write source file', executionTime: 0 };
        }

        // ---- Compile ----------------------------------------------------------
        console.log(`[DIAG] Compile volume mount: ${EXECUTION_VOLUME}:/volume (subdir run-${runId})`);
        const compileResult = await compile(runId);

        // Log compile stdout (contains diagnostic ls output)
        if (compileResult.stdout) {
            console.log(`[DIAG] Compile stdout:\n${compileResult.stdout}`);
        }

        if (compileResult.code !== 0) {
            console.log(`[DIAG] Compilation failed (exit ${compileResult.code})`);
            return {
                success: false,
                stdout: '',
                stderr: compileResult.stderr || 'Compilation failed',
                executionTime: 0,
            };
        }
        console.log('[DIAG] Compilation succeeded');

        // ---- Verify binary exists ---------------------------------------------
        const binPath = path.join(runDir, 'solution');
        const binExists = fs.existsSync(binPath);
        console.log(`[DIAG] solution binary exists: ${binExists}`);

        if (!binExists) {
            return { success: false, stdout: '', stderr: 'Internal error: compiled binary not found', executionTime: 0 };
        }

        // ---- Execute ----------------------------------------------------------
        const startTime = Date.now();
        const runResult = await execute(runId);
        const executionTime = Date.now() - startTime;

        return {
            success: runResult.code === 0,
            stdout: runResult.stdout,
            stderr: runResult.stderr,
            executionTime,
        };
    } catch (err) {
        // ---- Timeout & error handling -----------------------------------------
        if (err.message === 'COMPILE_TIMEOUT') {
            return { success: false, stdout: '', stderr: 'Compilation timed out', executionTime: COMPILE_TIMEOUT_MS };
        }
        if (err.message === 'RUNTIME_TIMEOUT') {
            return { success: false, stdout: '', stderr: 'Time Limit Exceeded', executionTime: RUN_TIMEOUT_MS };
        }
        console.error(`[DIAG] Unexpected error: ${err.message}`);
        return { success: false, stdout: '', stderr: err.message || 'Unknown error', executionTime: 0 };
    } finally {
        cleanupDir(runDir);
    }
}

module.exports = { executeCpp };
