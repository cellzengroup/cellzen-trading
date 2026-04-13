const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  value: { type: Number, default: 0 },
});

/**
 * Get the next sequential value for a named counter
 */
counterSchema.statics.getNext = async function (name) {
  const counter = await this.findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return counter.value;
};

module.exports = mongoose.model('Counter', counterSchema);
