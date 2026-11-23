# 02. Транспорт ICMP и разрешение имён

Статус: готово.

Blocked by: 01.

## Работа

- `EchoTransport`: IPv4/IPv6, таймаут, данные 32 байта, RTT, TTL.
- Windows-реализация: `IcmpSendEcho` и `Icmp6SendEcho2` без администратора.
- Заглушка не-Windows: `errors.icmp.unsupportedPlatform`.
- `TargetResolver`: системный резолвер, семейство, IP-литералы, scope id.
- Фейковые транспорт и резолвер для тестов.
- Фичи `windows` в `Cargo.toml`.

## Критерий

Проверка `127.0.0.1` и `::1` даёт ответ, неверный адрес даёт отказ,
на не-Windows инструмент не притворяется работающим.
