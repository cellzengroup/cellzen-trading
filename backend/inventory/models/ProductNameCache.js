const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

// The resolved Product Name for a 1688 listing title, kept so the packing list
// says the same thing about the same goods every time it is exported.
//
// Without this the name was recomputed per export from the listing title, which
// made it (a) a fresh LLM bill and ~20s of latency on every sheet, and (b) not
// actually stable — a different model revision, or a failed call falling back to
// the offline heuristic, silently renamed goods that a forwarder or a customs
// broker had already seen under another name. A packing list is a declaration;
// it should not drift between two prints of the same consignment.
//
// `source` is the whole point of the table:
//   'llm'    — written by services/productNames.js. Refreshable.
//   'manual' — a human corrected it. NEVER overwritten by a model; the resolver
//              checks this first and short-circuits. This is the escape hatch
//              for the names a model still gets wrong, and it is why the fix for
//              a bad name is a one-row update rather than a prompt edit.
//
// Keyed by a hash, not the title: titles run past 300 characters and Postgres
// btree keys cap out around 2704 bytes, so indexing the text itself is a
// landmine on a long listing. The title is kept alongside for readability when
// someone is looking at why a name came out the way it did.
const ProductNameCache = sequelize
  ? sequelize.define('ProductNameCache', {
      // sha256 of the normalised (spec-tags-stripped, case-folded) title.
      title_hash: { type: DataTypes.STRING(64), primaryKey: true },
      title: { type: DataTypes.TEXT, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      source: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'llm' },
      // Which model produced it, so a bad batch can be found and re-run after a
      // model swap instead of being cleared wholesale.
      model: { type: DataTypes.STRING(64), allowNull: true },
    }, {
      tableName: 'product_name_cache',
      timestamps: true, // createdAt / updatedAt (repo convention: no underscored)
    })
  : null;

module.exports = ProductNameCache;
