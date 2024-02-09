// models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: true,
    unique: true
  },
  userGender: {
    type: String,
    required: true
  },
  userCollege: {
    type: String,
    required: true
  },
  preferredGender: {
    type: String,
    required: true
  },
  preferredCollege: {
    type: String,
    required: true
  },
  isPaired: {
    type: Boolean,
    default: false
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  }
});

module.exports = mongoose.model('User', userSchema);
