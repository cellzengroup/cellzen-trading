require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { sequelize, User } = require('../inventory/models');

// Seeds (or refreshes) the 4 warehouse staff logins. Idempotent — safe to run
// repeatedly. Each account is pre-verified (emailVerified: true) so login is
// password-only (no first-login email code). Run:
//   node backend/scripts/seed-warehouse-staff.js
//
// Login (Staff Sign In at /staff-login, then open /warehouse):
//   username: staff1 / staff2 / staff3 / staff4
//   password: Cellzen2025@
const PASSWORD = 'Cellzen2025@';
const STAFF = [
  { username: 'staff1', email: 'staff1@cellzengroup.com', name: 'Staff One' },
  { username: 'staff2', email: 'staff2@cellzengroup.com', name: 'Staff Two' },
  { username: 'staff3', email: 'staff3@cellzengroup.com', name: 'Staff Three' },
  { username: 'staff4', email: 'staff4@cellzengroup.com', name: 'Staff Four' },
];

async function run() {
  if (!sequelize || !User) {
    console.error('Database not configured (DATABASE_URL missing) — nothing seeded.');
    return;
  }
  try {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);

    for (const s of STAFF) {
      const [user, created] = await User.findOrCreate({
        where: { username: s.username },
        defaults: {
          name: s.name,
          firstName: s.name.split(' ')[0],
          lastName: s.name.split(' ').slice(1).join(' ') || null,
          username: s.username,
          email: s.email,
          password: hashedPassword,
          role: 'staff',
          accountType: 'Staff',
          emailVerified: true,          // password-only login (skip email code)
          accountApprovalStatus: 'approved',
        },
      });

      if (!created) {
        // Refresh password + ensure the account is staff/verified/approved.
        await user.update({
          password: hashedPassword,
          role: 'staff',
          accountType: 'Staff',
          emailVerified: true,
          accountApprovalStatus: 'approved',
        });
      }

      console.log(`${created ? '✅ created' : '♻️  updated'}  ${s.username}  (${user.email})`);
    }

    console.log('\nWarehouse staff ready → username staff1..staff4 / password Cellzen2025@');
  } catch (error) {
    console.error('Seed failed:', error);
  } finally {
    await sequelize.close();
  }
}

run();
