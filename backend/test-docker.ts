import { performance } from "perf_hooks";
import supertest from "supertest";

const app1 = supertest("http://localhost:3001");
const app2 = supertest("http://localhost:3002");

async function resetAccount(account: string) {
    return app1
        .post("/reset")
        .send({ account})
        .expect(204)
}

async function sendChargeRequest(testApp:  supertest.SuperTest<supertest.Test>, account: string, charges: number) {
    return testApp
        .post("/charge")
        .send({ account, charges })
}
async function concurrentChargeInLimitTest() {
    await resetAccount("account");

    // Create two promises for concurrent charge requests
    const chargePromises = [
        sendChargeRequest(app1, "account", 50),
        sendChargeRequest(app2, "account", 50),
    ];

    // Execute the charge requests concurrently
    const [response1, response2] = await Promise.all(chargePromises);

    console.log(response1.body, response2.body);

    // Verify that both charges were successful
    if (!((response1.status === 200 && response2.status === 500) || (response1.status === 500 && response2.status === 200))) {
        throw new Error("Concurrent charge test failed.");
    }

    console.log("Concurrent charge test passed.");
}

async function concurrentChargeOutOfLimitTest() {
    await resetAccount("account");

    // Create two promises for concurrent charge requests
    const chargePromises = [
        sendChargeRequest(app1, "account", 50),
        sendChargeRequest(app2, "account", 100),
    ];

    // Execute the charge requests concurrently
    const [response1, response2] = await Promise.all(chargePromises);

    console.log(response1.body, response2.body);

    // Verify that both charges were successful
    if (!((response1.status === 200 && response2.status === 500) || (response1.status === 500 && response2.status === 200))) {
        throw new Error("Concurrent charge test failed.");
    }

    console.log("Concurrent charge test passed.");
}


async function runTests() {
    await concurrentChargeInLimitTest();
    await concurrentChargeOutOfLimitTest();
}

runTests().catch(console.error);
