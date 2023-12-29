const mongoose = require('mongoose');

const connectToMongo = (handler) => async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      return handler(req, res);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    return handler(req, res);
  } catch (error) {
    // Handle connection errors appropriately
    console.error('Error connecting to MongoDB:', error);
    return res.status(500).json({ message: 'Error connecting to MongoDB' });
  }
};

module.exports = connectToMongo;