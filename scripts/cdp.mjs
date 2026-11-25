// Управление живым окном приложения через Chrome DevTools Protocol.
//
// Запуск приложения с открытым портом: npm run dev:cdp.
// Порт берётся из CDP_PORT, по умолчанию 9222.
//
// Команды:
//   node scripts/cdp.mjs targets
//   node scripts/cdp.mjs eval "document.title"
//   node scripts/cdp.mjs screenshot [файл]
//   node scripts/cdp.mjs resize 1280 800
//   node scripts/cdp.mjs resize clear
//   node scripts/cdp.mjs key ctrl+w
//   node scripts/cdp.mjs logs [секунды]
//
// Скрипт не подменяет тесты: он проверяет настоящее окно WebView2, поэтому
// им проверяют разметку, стили, клавиши, фокус, размеры и ошибки консоли.

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const port = process.env.CDP_PORT ?? "9222";
const base = `http://127.0.0.1:${port}`;

/** Именованные клавиши, которым нужен не только символ, но и код. */
const NAMED_KEYS = {
  enter: { key: "Enter", code: "Enter", vk: 13 },
  escape: { key: "Escape", code: "Escape", vk: 27 },
  esc: { key: "Escape", code: "Escape", vk: 27 },
  tab: { key: "Tab", code: "Tab", vk: 9 },
  space: { key: " ", code: "Space", vk: 32 },
  backspace: { key: "Backspace", code: "Backspace", vk: 8 },
  delete: { key: "Delete", code: "Delete", vk: 46 },
  arrowup: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  arrowdown: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  arrowleft: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  arrowright: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  home: { key: "Home", code: "Home", vk: 36 },
  end: { key: "End", code: "End", vk: 35 },
  pageup: { key: "PageUp", code: "PageUp", vk: 33 },
  pagedown: { key: "PageDown", code: "PageDown", vk: 34 },
};

for (let number = 1; number <= 12; number += 1) {
  NAMED_KEYS[`f${number}`] = {
    key: `F${number}`,
    code: `F${number}`,
    vk: 111 + number,
  };
}

/** Список целей отладки. */
async function listTargets() {
  let response;
  try {
    response = await fetch(`${base}/json/list`);
  } catch {
    throw new Error(`Нет ответа на ${base}. Приложение запущено через npm run dev:cdp?`);
  }
  if (!response.ok) throw new Error(`CDP ответил ${response.status}.`);
  return response.json();
}

/** Страница приложения, а не служебная цель WebView2. */
async function pageTarget() {
  const targets = await listTargets();
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  if (!page) throw new Error("Страница приложения не найдена. Открой окно ToolBox.");
  return page;
}

/** Подключение к странице: запросы по id и подписка на события. */
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    const listeners = new Map();
    let nextId = 1;

    function send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolveSend, rejectSend) => {
        pending.set(id, { resolve: resolveSend, reject: rejectSend });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }

    socket.addEventListener("open", () => {
      resolve({
        send,
        on(method, handler) {
          const list = listeners.get(method) ?? [];
          list.push(handler);
          listeners.set(method, list);
        },
        close() {
          socket.close();
        },
      });
    });

    socket.addEventListener("error", () => {
      reject(new Error("Не удалось подключиться к CDP."));
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
        return;
      }
      for (const handler of listeners.get(message.method) ?? []) handler(message.params);
    });
  });
}

/** Открывает страницу на время команды и закрывает соединение. */
async function withPage(run) {
  const page = await pageTarget();
  const client = await connect(page.webSocketDebuggerUrl);
  try {
    return await run(client);
  } finally {
    client.close();
  }
}

/** Выполняет выражение в окне и возвращает значение. */
async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const reason = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
    throw new Error(reason);
  }
  return result.result?.value;
}

/** Сочетание клавиш в вид, который понимает Input.dispatchKeyEvent. */
function keyInfo(combo) {
  const parts = combo.toLowerCase().split("+");
  const name = parts.pop() ?? "";
  let modifiers = 0;

  for (const part of parts) {
    if (part === "ctrl" || part === "control") modifiers |= 2;
    else if (part === "alt") modifiers |= 1;
    else if (part === "shift") modifiers |= 8;
    else if (part === "meta" || part === "win") modifiers |= 4;
    else throw new Error(`Неизвестный модификатор: ${part}`);
  }

  if (NAMED_KEYS[name]) return { ...NAMED_KEYS[name], modifiers };
  if (/^[a-z]$/.test(name)) {
    return {
      key: name,
      code: `Key${name.toUpperCase()}`,
      vk: name.toUpperCase().charCodeAt(0),
      modifiers,
    };
  }
  if (/^[0-9]$/.test(name)) {
    return { key: name, code: `Digit${name}`, vk: name.charCodeAt(0), modifiers };
  }
  throw new Error(`Неизвестная клавиша: ${name}`);
}

/** Нажатие и отпускание клавиши с модификаторами. */
async function pressKey(client, combo) {
  const info = keyInfo(combo);
  const base = {
    modifiers: info.modifiers,
    key: info.key,
    code: info.code,
    windowsVirtualKeyCode: info.vk,
    nativeVirtualKeyCode: info.vk,
  };
  await client.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

function printHelp() {
  console.log("Управление живым окном через CDP.");
  console.log("");
  console.log("  node scripts/cdp.mjs targets              список целей отладки");
  console.log('  node scripts/cdp.mjs eval "<выражение>"   выполнить выражение в окне');
  console.log("  node scripts/cdp.mjs screenshot [файл]    снимок окна");
  console.log("  node scripts/cdp.mjs resize 1280 800      размер окна");
  console.log("  node scripts/cdp.mjs resize clear         вернуть размер");
  console.log("  node scripts/cdp.mjs key ctrl+w           нажать сочетание");
  console.log("  node scripts/cdp.mjs logs [секунды]       консоль и исключения");
  console.log("");
  console.log("Приложение: npm run dev:cdp. Порт: CDP_PORT, по умолчанию 9222.");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "targets") {
    const targets = await listTargets();
    if (targets.length === 0) {
      console.log("Целей нет.");
      return;
    }
    for (const [index, target] of targets.entries()) {
      console.log(`${index + 1}. ${target.type}  ${target.title}  ${target.url}`);
    }
    return;
  }

  if (command === "eval") {
    if (args.length === 0)
      throw new Error('Нужно выражение: node scripts/cdp.mjs eval "document.title"');
    const expression = args.join(" ");
    const value = await withPage((client) => evaluate(client, expression));
    if (typeof value === "string") console.log(value);
    else console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (command === "screenshot") {
    const file = path.resolve(args[0] ?? path.join(tmpdir(), "toolbox-cdp.png"));
    await withPage(async (client) => {
      await client.send("Page.enable");
      const { data } = await client.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(file, Buffer.from(data, "base64"));
    });
    console.log(file);
    return;
  }

  if (command === "resize") {
    await withPage(async (client) => {
      if (args[0] === "clear") {
        await client.send("Emulation.clearDeviceMetricsOverride");
      } else {
        const width = Number(args[0]);
        const height = Number(args[1]);
        if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
          throw new Error(
            "Размер задаётся двумя целыми числами: node scripts/cdp.mjs resize 1280 800",
          );
        }
        await client.send("Emulation.setDeviceMetricsOverride", {
          width,
          height,
          deviceScaleFactor: 0,
          mobile: false,
        });
      }
      const size = await evaluate(
        client,
        "JSON.stringify({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })",
      );
      console.log(size);
    });
    return;
  }

  if (command === "key") {
    if (!args[0]) throw new Error("Нужно сочетание: node scripts/cdp.mjs key ctrl+w");
    await withPage((client) => pressKey(client, args[0]));
    console.log(`Отправлено: ${args[0]}`);
    return;
  }

  if (command === "logs") {
    const seconds = Number(args[0] ?? 3);
    if (!Number.isFinite(seconds) || seconds <= 0)
      throw new Error("Секунды задаются положительным числом.");

    let failed = false;
    await withPage(async (client) => {
      client.on("Runtime.consoleAPICalled", (params) => {
        const text = params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(" ");
        console.log(`[console.${params.type}] ${text}`);
        if (params.type === "error") failed = true;
      });
      client.on("Log.entryAdded", (params) => {
        console.log(`[${params.entry.level}] ${params.entry.text}`);
        if (params.entry.level === "error") failed = true;
      });
      client.on("Runtime.exceptionThrown", (params) => {
        const details = params.exceptionDetails;
        console.log(`[exception] ${details.exception?.description ?? details.text}`);
        failed = true;
      });

      await client.send("Runtime.enable");
      await client.send("Log.enable");
      console.log(`Слушаю ${seconds} с...`);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    });

    if (failed) process.exitCode = 1;
    return;
  }

  throw new Error(`Неизвестная команда: ${command}. Справка: node scripts/cdp.mjs help`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
