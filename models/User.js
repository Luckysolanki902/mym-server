const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    index: true,
    required: true,
    unique: true,
    validate: {
      validator: (value) => {
        const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(value);
      },
      message: (props) => `${props.value} is not a valid email address`,
    },
  },
  gender: {
    type: String,
    index: true,
    required: true,
  },
  college: {
    type: String,
    required: true,
    index: true, 
  },
  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  mid: {
    index: true,
    type: String,
    unique: true,
    default: () => uuidv4(),
  },
  tokenId: {
    index: true,
    type: String,
    unique: true,
    default: () => uuidv4(),
  },
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
