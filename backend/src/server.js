import app from './app.js';
import { config } from './shared/config.js';
import { seedDatabase } from './modules/admin/seedService.js';

seedDatabase();

app.listen(config.port, () => {
  console.log(`Reimbursement backend running on http://localhost:${config.port}`);
});
