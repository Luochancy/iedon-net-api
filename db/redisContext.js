/*
*******************************************************************
db/redisContext.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
import Redis from "ioredis";

export async function useRedisContext(app, redisSettings) {
  const dbLogger = app.logger.getLogger("database");
  redisSettings.driver.lazyConnect = true;
  const redis = new Redis(redisSettings.driver);
  redis.on("error", (err) => {
    dbLogger.error(err);
  });
  await redis.connect();

  // Atomically consume one verification attempt of a pending auth state.
  // Returns {status:'missing'} when the state expired or was already used,
  // {status:'locked'} once the attempt budget is exhausted (state is dropped),
  // otherwise {status:'ok', ...state}. Keeps the original TTL so a wrong guess
  // never extends the window.
  redis.defineCommand("consumeAuthState", {
    numberOfKeys: 1,
    lua: `
      local raw = redis.call('GET', KEYS[1])
      if not raw then
        return cjson.encode({ status = 'missing' })
      end

      local data = cjson.decode(raw)
      data.attempts = (data.attempts or 0) + 1

      if data.attempts > tonumber(ARGV[1]) then
        redis.call('DEL', KEYS[1])
        return cjson.encode({ status = 'locked' })
      end

      redis.call('SET', KEYS[1], cjson.encode(data), 'KEEPTTL')
      data.status = 'ok'
      return cjson.encode(data)
    `,
  });

  // Define custom command for merging enum data atomically
  redis.defineCommand("mergeEnum", {
    numberOfKeys: 1,
    lua: `
      local key = KEYS[1]
      local newData = cjson.decode(ARGV[1])
      local existing = redis.call('GET', key)
      local merged = {}
      
      if existing then
        merged = cjson.decode(existing)
      end
      
      for uuid, peers in pairs(newData) do
        merged[uuid] = peers
      end
      
      return redis.call('SET', key, cjson.encode(merged))
    `,
  });

  app.redis = {
    setData: async (key, data) => {
      try {
        return await redis.set(
          key,
          JSON.stringify(data)
        ) === "OK";
      } catch (err) {
        dbLogger.error(`Error writing data to redis for key ${key}:`, err);
        return false;
      }
    },
    setDataEx: async (key, data, ttlSeconds) => {
      try {
        return await redis.set(
          key,
          JSON.stringify(data),
          "EX",
          ttlSeconds
        ) === "OK";
      } catch (err) {
        dbLogger.error(`Error writing data to redis for key ${key}:`, err);
        return false;
      }
    },
    getData: async (key) => {
      try {
        const result = await redis.get(key);
        return result ? JSON.parse(result) : null;
      } catch (err) {
        dbLogger.error(`Error fetching data from redis for key ${key}:`, err);
        return null;
      }
    },
    consumeAuthState: async (key, maxAttempts) => {
      try {
        const result = await redis.consumeAuthState(key, maxAttempts);
        return result ? JSON.parse(result) : { status: "missing" };
      } catch (err) {
        dbLogger.error(`Error consuming auth state for key ${key}:`, err);
        // Fail closed: a redis error must never be treated as a passed check.
        return { status: "error" };
      }
    },
    deleteData: async (key) => {
      try {
        return await redis.del(key) > 0;
      } catch (err) {
        dbLogger.error(`Error deleting data from redis for key ${key}:`, err);
        return false;
      }
    },
    getInstance: () => redis,
  };
}
