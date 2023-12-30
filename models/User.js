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
  isActive: {
    type: Boolean,
    default: false, // Set the default value to false
  },
  isPaired:{
    type: Boolean,
    default: false,
  }
}, { timestamps: true }); // Adding timestamps for createdAt and updatedAt

// Adding a method to toggle user activity
UserSchema.methods.toggleActivity = async function (isActive) {
  this.isActive = isActive;
  await this.save();
};
UserSchema.methods.togglePairedStatus = async function (isPaired) {
  this.isPaired = isPaired;
  await this.save();
};
mongoose.models = {};
const User = mongoose.model('User', UserSchema);

module.exports = User;
 