/**
 * One-time script: create Supabase Storage bucket and migrate existing local
 * product images + update database URLs.
 *
 * Usage: node backend/scripts/migrate-images.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const { Sequelize, DataTypes } = require('sequelize');
const dns = require('dns');
const fs = require('fs');
const path = require('path');

dns.setDefaultResultOrder('verbatim');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
});

const Product = sequelize.define('Product', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  image_url: DataTypes.STRING,
}, { tableName: 'products', timestamps: false });

async function main() {
  // 1. Create bucket (public so images are accessible via URL)
  console.log(`Creating bucket "${BUCKET}"...`);
  const { data: bucketData, error: bucketError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  });

  if (bucketError) {
    if (bucketError.message?.includes('already exists')) {
      console.log('Bucket already exists — OK');
    } else {
      console.error('Bucket creation failed:', bucketError.message);
      process.exit(1);
    }
  } else {
    console.log('Bucket created successfully');
  }

  // 2. Connect to database
  await sequelize.authenticate();
  console.log('Connected to PostgreSQL');

  // 3. Find products with local /uploads/ image URLs
  const products = await Product.findAll({
    where: { image_url: { [Sequelize.Op.like]: '/uploads/%' } },
  });

  console.log(`Found ${products.length} product(s) with local image URLs`);

  const uploadsBase = path.join(__dirname, '..', 'uploads');

  for (const product of products) {
    const localRelPath = product.image_url; // e.g. /uploads/products/123.jpg
    const localAbsPath = path.join(uploadsBase, localRelPath.replace('/uploads/', ''));

    if (!fs.existsSync(localAbsPath)) {
      console.log(`  SKIP ${product.name} — file not found: ${localAbsPath}`);
      continue;
    }

    const fileBuffer = fs.readFileSync(localAbsPath);
    const fileName = path.basename(localAbsPath);
    const storagePath = `products/${fileName}`;
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };

    console.log(`  Uploading ${fileName} for "${product.name}"...`);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mimeTypes[ext] || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error(`    FAILED: ${uploadError.message}`);
      continue;
    }

    // Get public URL
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const publicUrl = data.publicUrl;

    // Update database
    await product.update({ image_url: publicUrl });
    console.log(`    OK → ${publicUrl}`);
  }

  console.log('\nMigration complete!');
  await sequelize.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
