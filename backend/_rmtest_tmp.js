// TEMP: remove the two live-check test users. Safe to delete after.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const sequelize = require('./config/postgres');
const { Op } = require('sequelize');
const User = require('./inventory/models/User');

(async () => {
  try {
    await sequelize.authenticate();
    const n = await User.destroy({ where: { email: { [Op.in]: [
      'livecheck.e2e@cellzentest.dev',
      'livecheck.staff@cellzentest.dev',
    ] } } });
    console.log(`Removed ${n} test user(s).`);
    const left = await User.count({ where: { email: { [Op.like]: '%cellzentest.dev' } } });
    console.log(`Remaining cellzentest.dev users: ${left}`);
  } catch (e) {
    console.error('Cleanup failed:', e.message); process.exitCode = 1;
  } finally { await sequelize.close(); }
})();
