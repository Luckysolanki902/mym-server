const redis = require('redis');
const { promisify } = require('util');

const client = redis.createClient();

// Promisify Redis commands
const rpushAsync = promisify(client.rPush).bind(client);
const lpopAsync = promisify(client.lPop).bind(client);
const smembersAsync = promisify(client.sMembers).bind(client);
const delAsync = promisify(client.del).bind(client);

client.on('error', (err) => {
  console.error(`Redis Error: ${err}`);
});

module.exports = {
  rpushAsync,
  lpopAsync,
  smembersAsync,
  delAsync,
};
