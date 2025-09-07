const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema({
  betnixId: { type: String, required: true, unique: true },
  displayName: String,
  email: String,
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('User', UserSchema);
