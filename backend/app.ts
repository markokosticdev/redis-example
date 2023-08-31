import express from "express";
import {createClient, RedisClientType} from "redis";
import {json} from "body-parser";

const DEFAULT_BALANCE = 100;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

const redisPool: RedisClientType[] = [];

async function getRedisClient(): Promise<RedisClientType> {
    if (redisPool.length > 0) {
        return redisPool.pop() as RedisClientType;
    } else {
        return await connect();
    }
}

async function connect(): Promise<RedisClientType> {
    const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
    console.log(`Using redis URL ${url}`);
    const client = createClient({ url }) as RedisClientType;
    await client.connect();
    return client;
}

async function reset(account: string): Promise<void> {
    const client = await connect(); // We could use connection pool with getRedisClient
    try {
        await client.set(`${account}/balance`, DEFAULT_BALANCE);
    } finally {
        await client.disconnect();
        // Connection pool
        // if (client) {
        //     redisPool.push(client);
        // }
    }
}

async function charge(account: string, charges: number): Promise<ChargeResult> {
    const client = await connect(); // We could use connection pool with getRedisClient
    const key = `${account}/balance`;

    return new Promise(async (resolve, reject) => {
        try {
            await client.watch(key);

            const balance = parseInt(await client.get(key) ?? '') || 0;

            if (balance >= charges) {
                const multi = client.multi();
                multi.set(key, balance - charges);
                multi.get(key);

                const [setResult, getResult] = await multi.exec();

                if (setResult === 'OK' && getResult != null) {
                    const remainingBalance = parseInt(getResult.toString() ?? '') || 0;
                    resolve({ isAuthorized: true, remainingBalance, charges });
                    return;
                }
                reject(new Error('Transaction failed'));
                return;
            } else {
                reject(new Error('Insufficient balance'));
                return;
            }
        } catch (error) {
            console.error("Error while charging account", error);
            reject(error);
        } finally {
            await client.unwatch();
            await client.disconnect();
            // Connection pool
            // if (client) {
            //     redisPool.push(client);
            // }
        }
    });
}

export function buildApp(): express.Application {
    const app = express();
    app.use(json());
    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`Successfully reset account ${account}`);
            res.sendStatus(204);
        } catch (e) {
            console.error("Error while resetting account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/charge", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await charge(account, req.body.charges ?? 10);
            console.log(`Successfully charged account ${account}`);
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while charging account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    return app;
}
