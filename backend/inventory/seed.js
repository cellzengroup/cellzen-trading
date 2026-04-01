require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { sequelize, User, Product, Location } = require('./models');

const seed = async () => {
  try {
    console.log('Connecting to PostgreSQL...');
    await sequelize.authenticate();
    console.log('Connected successfully.');

    console.log('Syncing database tables...');
    await sequelize.sync({ force: true });
    console.log('Tables created.');

    // Seed admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await User.create({
      name: 'Admin',
      email: 'admin@cellzentrading.com',
      password: hashedPassword,
      role: 'admin',
    });
    console.log('Admin user created (admin@cellzentrading.com / admin123)');

    // Seed locations
    await Location.bulkCreate([
      { name: 'Guangzhou Warehouse', type: 'warehouse' },
      { name: 'Retail Shop', type: 'shop' },
      { name: 'Spring Exhibition 2026', type: 'exhibition' },
    ]);
    console.log('Locations created.');

    // Seed sample products
    await Product.bulkCreate([
      {
        name: 'Tibetan Singing Bowl - Large',
        description: 'Handcrafted singing bowl, 10 inch diameter',
        barcode: 'SB-001',
        cost_price: 150.00,
        retail_price: 350.00,
        wholesale_price: 250.00,
      },
      {
        name: 'Green Tara Thangka',
        description: 'Traditional hand-painted thangka on cotton canvas',
        barcode: 'TH-001',
        cost_price: 200.00,
        retail_price: 500.00,
        wholesale_price: 380.00,
      },
      {
        name: 'Turquoise Mala Necklace',
        description: '108 bead turquoise mala with silver guru bead',
        barcode: 'JW-001',
        cost_price: 45.00,
        retail_price: 120.00,
        wholesale_price: 85.00,
      },
    ]);
    console.log('Sample products created.');

    console.log('\nSeed completed successfully!');
    console.log('You can now login with: admin@cellzentrading.com / admin123');

    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
};

seed();
