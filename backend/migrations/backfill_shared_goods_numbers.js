require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize, WarehouseItem } = require('../inventory/models');

// One-off backfill: merges each existing 1688 order's boxes onto ONE shared
// goods number (the earliest box's code) — matching the put-away behavior in
// routes/warehouse.js (generateItemCode). Boxes scanned in before that fix
// shipped each got their own sequential code; this brings historical rows in
// line so the whole order shows one CZN code everywhere (Ship table, packing
// list "Goods No.", etc).
//
// NOTE: if a box's code changes here and its label was already printed, the
// app will show a different code than what's physically stuck on that box —
// re-print affected labels that haven't shipped yet.
//
// Dry run (default, no writes):
//   node backend/migrations/backfill_shared_goods_numbers.js
// Apply for real (writes a JSON backup of the old codes first):
//   node backend/migrations/backfill_shared_goods_numbers.js --apply
async function migrate() {
  const apply = process.argv.includes('--apply');
  if (!sequelize || !WarehouseItem) {
    console.error('Database not configured');
    return;
  }
  try {
    const rows = await WarehouseItem.findAll({
      where: { source: 'gtradea', order_number: { [Op.ne]: null } },
      order: [['order_number', 'ASC'], ['createdAt', 'ASC']],
      attributes: ['id', 'code', 'order_number', 'status', 'createdAt'],
    });

    const byOrder = new Map();
    for (const r of rows) {
      if (!byOrder.has(r.order_number)) byOrder.set(r.order_number, []);
      byOrder.get(r.order_number).push(r);
    }

    const changes = [];
    for (const [orderNumber, items] of byOrder) {
      const canonical = items[0].code; // earliest box on file for this order
      for (const it of items.slice(1)) {
        if (it.code !== canonical) changes.push({ id: it.id, orderNumber, status: it.status, from: it.code, to: canonical });
      }
    }

    if (!changes.length) {
      console.log('Nothing to merge — every order already shares one goods number.');
      return;
    }

    const orderCount = new Set(changes.map((c) => c.orderNumber)).size;
    console.log(`${changes.length} item(s) across ${orderCount} order(s) would be merged:`);
    for (const c of changes) console.log(`  ${c.orderNumber}: ${c.from} -> ${c.to}  (item ${c.id}, ${c.status})`);

    if (!apply) {
      console.log('\nDry run only — nothing changed. Re-run with --apply to write these changes.');
      return;
    }

    const backupPath = path.join(__dirname, `backfill_goods_numbers_backup_${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(changes, null, 2));
    console.log(`Backup of original codes written to ${backupPath}`);

    for (const c of changes) {
      await WarehouseItem.update({ code: c.to }, { where: { id: c.id } });
    }
    console.log(`Done — ${changes.length} item(s) updated.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
