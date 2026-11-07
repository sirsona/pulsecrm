// server/scripts/day2-flow-demo.js
//
// FlowProducer demo (mechanics only, nothing hits a provider).
//
// BullMQ flow semantics: children are processed FIRST and the parent job stays
// in "waiting-children" until all children settle.
const { FlowProducer } = require("bullmq");
const { connection, notificationsQueue } = require("../queues");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitState(job, state, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await job.getState()) === state) return true;
    await sleep(300);
  }
  return false;
}

(async () => {
  const flow = new FlowProducer({ connection });

  const tree = await flow.add({
    name: "process-order",
    queueName: "notifications",
    data: { orderId: "demo-order-1" },
    children: [
      { name: "ping", queueName: "notifications", data: { from: "child-1" } },
      {
        name: "sleep",
        queueName: "notifications",
        data: { ms: 300, from: "child-2" },
      },
    ],
  });

  console.log(
    "flow added: parent",
    tree.job.id,
    "| children",
    tree.children.map((c) => c.job.id).join(","),
  );

  // Parent stays "waiting-children" until the children complete.
  console.log("parent initial state:", await tree.job.getState());

  await waitState(tree.job, "completed", 20000);
  for (const c of tree.children) {
    await waitState(c.job, "completed", 20000);
  }

  const parent = await notificationsQueue.getJob(tree.job.id);
  console.log("parent final state:", await parent.getState());

  for (const c of tree.children) {
    const child = await notificationsQueue.getJob(c.job.id);
    console.log(
      `child ${child.id} (${child.name}) state: ${await child.getState()} | finished before parent: ${child.finishedOn <= parent.finishedOn}`,
    );
  }

  await flow.close();
  process.exit(0);
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
