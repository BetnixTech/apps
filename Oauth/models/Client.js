const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  clientId: { type: String, unique: true },
  clientSecret: String,
  redirectUri: String
});

module.exports = mongoose.model('Client', clientSchema);
