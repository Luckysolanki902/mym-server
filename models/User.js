// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  userEmail: { type: String, unique: true, required: true },
  userGender: String,
  userCollege: String,
  preferredGender: String,
  preferredCollege: String,
  isPaired: { type: Boolean, default: false },
  room: String,
  pairedSocketId: String
});

module.exports = mongoose.model('User', UserSchema);
