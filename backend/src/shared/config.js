import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || 'reimbursement-demo-secret',
  dbPath: process.env.DB_PATH || './data/reimbursement.db',
  pythonExecutable: process.env.PYTHON_EXECUTABLE || 'python',
  advisoryTimeoutMs: Number(process.env.ADVISORY_TIMEOUT_MS || 10000),
};
