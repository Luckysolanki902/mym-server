const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  gender: {
    type: String,
    required: true,
  },
  age: {
    type: Number,
    required: true,
  },
  college: {
    type: String,
    required: true,
  },
}, { timestamps: true }); // Adding timestamps for createdAt and updatedAt

mongoose.models = {};
const User = mongoose.model('User', UserSchema);

module.exports = User;
 