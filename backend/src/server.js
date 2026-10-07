import app from './app.js';
import { config } from './config.js';
import { seedDatabase } from './services/seedService.js';

seedDatabase();

app.listen(config.port, () => {
  console.log(`Reimbursement backend running on http://localhost:${config.port}`);
});
