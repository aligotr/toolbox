// Проверки витрины Busprobe.
//
// Одна кнопка запускает учебный прогон и получает ответ; путь приходит
// отдельным событием и в тестах не доставляется. Проверяется состояние
// операции: какой запрос ушёл в ядро и что осталось в панели.

import assert from "node:assert/strict";
import test from "node:test";
import { installBuiltin } from "../../src/core/infra/i18n/index.ts";
import { ruMessages } from "../../src/core/infra/i18n/messages.ts";
import { useBusprobe } from "../../src/tools/busprobe/useBusprobe.ts";
import { calls, setInvokeHandler } from "../support/fakes/core.mjs";

installBuiltin(ruMessages);

test("учебный прогон возвращает ответ и заполняет панель", async () => {
  setInvokeHandler((command) => {
    if (command === "ask_traced") {
      return { echo: "Hello, core!", at: 1700000000000, correlation_id: "c-1" };
    }
    return null;
  });

  const bus = useBusprobe();
  await bus.checkBus();

  assert.deepEqual(
    calls.map((call) => call.command),
    ["ask_traced"],
  );
  assert.deepEqual(calls[0]?.args, {
    topic: "core:ping",
    replyTopic: "core:pong",
    payload: { echo: "Hello, core!", delay_ms: 120 },
    timeoutMs: 5000,
  });
  assert.equal(bus.reply.value?.echo, "Hello, core!");
  assert.equal(bus.status.error, null);
});

test("отказ прогона очищает прошлый ответ", async () => {
  setInvokeHandler(() => ({
    echo: "Первый",
    at: 1700000000000,
    correlation_id: "c-1",
  }));
  const bus = useBusprobe();
  await bus.checkBus();
  assert.equal(bus.reply.value?.echo, "Первый");

  setInvokeHandler(() => {
    throw new Error("ядро недоступно");
  });
  await bus.checkBus();

  assert.equal(bus.reply.value, null);
  assert.equal(typeof bus.status.error, "string");
});
