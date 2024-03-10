// utils/countingUtils.js

function emitRoundedUsersCount(io, size) {
  // Emit the rounded user count
  io.emit('roundedUsersCount', size);
}

module.exports = { emitRoundedUsersCount };
