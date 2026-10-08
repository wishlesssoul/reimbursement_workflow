import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from '../../shared/config.js';

const agentPath = fileURLToPath(new URL('./advisory_agent.py', import.meta.url));
const maxOutputBytes = 128 * 1024;

export class AdvisoryAgentError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'AdvisoryAgentError';
    this.statusCode = statusCode;
  }
}

function parseAgentOutput(output) {
  let result;
  try {
    result = JSON.parse(output);
  } catch {
    throw new AdvisoryAgentError('The Python advisory agent returned invalid JSON.', 502);
  }

  if (
    result?.engine !== 'python-rules-v1' ||
    typeof result.advisory?.summary !== 'string' ||
    !Array.isArray(result.advisory.observations) ||
    !Array.isArray(result.advisory.questions) ||
    !Array.isArray(result.possibleDuplicates)
  ) {
    throw new AdvisoryAgentError('The Python advisory agent returned an incomplete response.', 502);
  }

  return result;
}

export function generateReviewAdvisory(context) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.pythonExecutable, [agentPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let outputBytes = 0;
    let settled = false;

    const finishWithError = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      reject(error);
    };

    const timeout = setTimeout(() => {
      finishWithError(new AdvisoryAgentError('The Python advisory agent timed out.', 504));
    }, config.advisoryTimeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      outputBytes += Buffer.byteLength(chunk, 'utf8');
      if (outputBytes > maxOutputBytes) {
        finishWithError(new AdvisoryAgentError('The Python advisory agent returned too much data.', 502));
      }
    });
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {});

    child.on('error', (error) => {
      const message = error.code === 'ENOENT'
        ? 'Python was not found. Set PYTHON_EXECUTABLE to an installed Python runtime.'
        : 'The Python advisory agent could not be started.';
      finishWithError(new AdvisoryAgentError(message, 503));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new AdvisoryAgentError('The Python advisory agent failed to analyze this request.', 502));
        return;
      }
      try {
        resolve(parseAgentOutput(output));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify(context));
  });
}