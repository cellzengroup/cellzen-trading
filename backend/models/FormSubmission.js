const mongoose = require('mongoose');
const crypto = require('crypto');

const formSubmissionSchema = new mongoose.Schema({
  token: {
    type: String,
    unique: true,
    default: () => crypto.randomBytes(16).toString('hex')
  },
  formType: {
    type: String,
    required: true,
    enum: ['thangka', 'soundBowls', 'sacredItems', 'contact']
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
formSubmissionSchema.index({ formType: 1, createdAt: -1 });
formSubmissionSchema.index({ token: 1 });

module.exports = mongoose.model('FormSubmission', formSubmissionSchema);

