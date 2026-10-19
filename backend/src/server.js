import { startContactChangeProcessor } from './modules/auth/contact-change.processor.js';
import app from './app.js';
import env from './config/env.js';

app.listen(env.port, () => {
  startContactChangeProcessor();
  console.log(`Server running on port ${env.port}`);
});