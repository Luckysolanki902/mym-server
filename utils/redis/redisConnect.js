const { createClient } = require('redis');
require('dotenv').config();
const REDIS_PORT = process.env.REDIS_PORT;
const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_USERNAME = process.env.REDIS_USERNAME;

const REDIS_URL = `redis://${REDIS_USERNAME}:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`;

let redisClient;

try {
    redisClient = createClient({
        url: REDIS_URL,
    });

    redisClient.on('error', (err) => {
        console.error('Redis Error:', err);
    });

    redisClient.on('connect', () => {
        console.log('Connected to Redis');
    });
} catch (error) {
    console.error('Error connecting to Redis:', error);
}

module.exports = redisClient;
