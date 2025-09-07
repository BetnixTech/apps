const mongoose = require('mongoose');
const SettingSchema = new mongoose.Schema({
  ssid: { type: String, default: 'BetnixWiFi' },
  wifiPass: { type: String, default: 'changeme1234' },
  channel: { type: Number, default: 6 },
  dhcpStart: { type: String, default: '192.168.10.10' },
  dhcpEnd: { type: String, default: '192.168.10.100' },
  updatedAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Setting', SettingSchema);
