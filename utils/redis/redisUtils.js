// redisUtils.js
async function addToRedisSet(redisClient, pageType, userId, userData) {
    await redisClient.hmset('user:' + userId, userData);
    await redisClient.sadd(pageType + ':users', userId);
}

async function removeFromRedisSet(redisClient, pageType, userId) {
    await redisClient.srem(pageType + ':users', userId);
    await redisClient.del('user:' + userId);
}

async function addToRedisQueue(redisClient, pageType, userId) {
    await redisClient.rpush(pageType + ':queue', userId);
}

async function removeFromRedisQueue(redisClient, pageType, userId) {
    await redisClient.lrem(pageType + ':queue', 1, userId);
}

async function getUserFromRedis(redisClient, userId) {
    return await redisClient.hgetall('user:' + userId);
}

async function getQueueLengthFromRedis(redisClient, pageType) {
    return await redisClient.llen(pageType + ':queue');
}

module.exports = {
    addToRedisSet,
    removeFromRedisSet,
    addToRedisQueue,
    removeFromRedisQueue,
    getUserFromRedis,
    getQueueLengthFromRedis,
};
