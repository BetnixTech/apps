const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  room: { type: String, required: true },
  type: { type: String, required: true }, // light, lock, camera
  brand: { type: String },
  ip: { type: String, required: true },
  state: { type: Boolean, default: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('Device', DeviceSchema);
