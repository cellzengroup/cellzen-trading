const express = require('express');
const AppSetting = require('../models/AppSetting');
const TransportRate = require('../models/TransportRate');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_EXCHANGE_RATES = { USD: 1, CNY: 7.24, NPR: 135.5 };

// Production deploys default to no auto-sync, so freshly added settings tables
// won't exist on first boot. Lazily run CREATE TABLE IF NOT EXISTS on the
// first call so the feature works without an out-of-band sync-db run.
let tablesReady = null;
function ensureTables() {
  if (tablesReady) return tablesReady;
  const tasks = [];
  if (AppSetting) tasks.push(AppSetting.sync());
  if (TransportRate) tasks.push(TransportRate.sync());
  tablesReady = Promise.all(tasks).catch((err) => {
    tablesReady = null;
    throw err;
  });
  return tablesReady;
}

// Map a TransportRate row to the shape the admin UI expects.
// The UI uses `from`/`to` (reserved-ish in SQL) so the model stores the
// columns as `fromLocation`/`toLocation` and we translate at the boundary.
function serializeRate(row) {
  if (!row) return null;
  const r = row.toJSON ? row.toJSON() : row;
  return {
    id: r.id,
    mode: r.mode,
    method: r.method,
    from: r.fromLocation,
    to: r.toLocation,
    rate: r.rate != null ? Number(r.rate) : null,
    unit: r.unit,
    rateKg: r.rateKg != null ? Number(r.rateKg) : null,
    rateCBM: r.rateCBM != null ? Number(r.rateCBM) : null,
    rateBorder: r.rateBorder != null ? Number(r.rateBorder) : null,
    unitBorder: r.unitBorder,
    date: r.effectiveDate,
  };
}

function rateInputFromBody(body = {}) {
  const today = new Date().toISOString().split('T')[0];
  const out = {
    mode: body.mode ?? null,
    method: body.method ?? null,
    fromLocation: body.from ?? body.fromLocation ?? null,
    toLocation: body.to ?? body.toLocation ?? null,
    rate: body.rate !== undefined && body.rate !== '' ? body.rate : null,
    unit: body.unit ?? null,
    rateKg: body.rateKg !== undefined && body.rateKg !== '' ? body.rateKg : null,
    rateCBM: body.rateCBM !== undefined && body.rateCBM !== '' ? body.rateCBM : null,
    rateBorder: body.rateBorder !== undefined && body.rateBorder !== '' ? body.rateBorder : null,
    unitBorder: body.unitBorder ?? null,
    effectiveDate: body.date ?? today,
  };
  return out;
}

// ---------- Exchange rates ----------

// GET exchange rates — public so non-admin pages can read the active rates
// without a token (matches how the frontend CurrencyContext is used app-wide).
router.get('/exchange-rates', async (req, res) => {
  try {
    if (!AppSetting) {
      return res.json({ success: true, data: DEFAULT_EXCHANGE_RATES });
    }
    await ensureTables();
    const row = await AppSetting.findByPk('exchange_rates');
    res.json({ success: true, data: row ? row.value : DEFAULT_EXCHANGE_RATES });
  } catch (error) {
    console.error('Get exchange rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch exchange rates' });
  }
});

router.put('/exchange-rates', authenticate, async (req, res) => {
  try {
    if (!AppSetting) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }
    await ensureTables();
    const incoming = req.body && typeof req.body === 'object' ? req.body : {};
    const merged = { ...DEFAULT_EXCHANGE_RATES };
    for (const k of Object.keys(incoming)) {
      const v = parseFloat(incoming[k]);
      if (!isNaN(v) && v > 0) merged[k] = v;
    }

    const [row] = await AppSetting.upsert({ key: 'exchange_rates', value: merged }, { returning: true });
    res.json({ success: true, data: row ? row.value : merged });
  } catch (error) {
    console.error('Update exchange rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to update exchange rates' });
  }
});

// ---------- Transport rates ----------

router.get('/transport-rates', authenticate, async (req, res) => {
  try {
    if (!TransportRate) {
      return res.json({ success: true, data: [] });
    }
    await ensureTables();
    const rows = await TransportRate.findAll({ order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: rows.map(serializeRate) });
  } catch (error) {
    console.error('Get transport rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transport rates' });
  }
});

router.post('/transport-rates', authenticate, async (req, res) => {
  try {
    if (!TransportRate) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }
    await ensureTables();
    const payload = rateInputFromBody(req.body);
    if (!payload.mode) {
      return res.status(400).json({ success: false, message: 'mode is required' });
    }
    const row = await TransportRate.create(payload);
    res.status(201).json({ success: true, data: serializeRate(row) });
  } catch (error) {
    console.error('Create transport rate error:', error);
    res.status(500).json({ success: false, message: 'Failed to create transport rate' });
  }
});

router.put('/transport-rates/:id', authenticate, async (req, res) => {
  try {
    if (!TransportRate) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }
    await ensureTables();
    const row = await TransportRate.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Transport rate not found' });
    }
    await row.update(rateInputFromBody({ ...serializeRate(row), ...req.body }));
    res.json({ success: true, data: serializeRate(row) });
  } catch (error) {
    console.error('Update transport rate error:', error);
    res.status(500).json({ success: false, message: 'Failed to update transport rate' });
  }
});

router.delete('/transport-rates/:id', authenticate, async (req, res) => {
  try {
    if (!TransportRate) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }
    await ensureTables();
    const row = await TransportRate.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Transport rate not found' });
    }
    await row.destroy();
    res.json({ success: true, message: 'Transport rate deleted' });
  } catch (error) {
    console.error('Delete transport rate error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete transport rate' });
  }
});

module.exports = router;
