// utils/countingUtils.js

function emitRoundedUsersCount(io, users) {
    let roundedCount = 0;
    const userCount = users.size;
  
    if (userCount < 5) {
      roundedCount = 5;
    } else if (userCount >= 5 && userCount < 10) {
      roundedCount = 10;
    } else if (userCount >= 10 && userCount < 15) {
      roundedCount = 15;
    } else if (userCount >= 15 && userCount < 100) {
      roundedCount = Math.ceil(userCount / 10) * 10;
    } else if (userCount >= 100 && userCount < 1000) {
      roundedCount = Math.ceil(userCount / 50) * 50;
    } else if (userCount >= 1000) {
      roundedCount = Math.ceil(userCount / 100) * 100;
    }
  
    // Emit the rounded user count
    io.emit('roundedUsersCount', roundedCount);
  }
  
  module.exports = { emitRoundedUsersCount };
   