# Numes в DeepSeek Harness

Как подключить [Numes](https://numes.ai) к [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) штатными средствами — включая **гарантированно бесплатный маршрут**, который не может уехать на платный endpoint.

[English version](README.md). Неофициальный гайд.

**Плагин писать не нужно.** В DSH уже есть адаптер `llm-pi-ai` для OpenAI-совместимых шлюзов, поэтому Numes добавляется через **Settings → Models → Add model provider**.

## Быстро: две минуты

Нужны: рабочий DSH и **inference-ключ** Numes из [Keys](https://numes.ai/dashboard/keys). Валюта ключа выбирается навсегда.

1. В DSH: **Settings → Models**.
2. **Add model provider → Custom model API**.
3. Заполните:

   | Поле | Значение |
   | --- | --- |
   | Provider ID | `numes` |
   | Protocol | **OpenAI Chat Completions** |
   | Endpoint | `https://api.numes.ai/api/v1` |
   | API key | ваш ключ ровно в том виде, в каком его выдал Numes |

4. Сохраните. Ключ попадёт в хранилище ключей DSH, а не в конфигурацию провайдера. Альтернатива — передать `NUMES_API_KEY` процессу, который запускает DSH.
5. **Fetch available models** → выберите модели → **Update list**. Discovery читает `GET /api/v1/models`; он не проверяет инференс и не доказывает, что модель бесплатна.
6. В композере выберите модель Numes, например `moonshotai/kimi-k3.1-pro:free`.

> ID с `/` и `:` — это нормально. DSH показывает `numes/moonshotai/kimi-k3.1-pro:free`, чтобы выбрать маршрут, а Numes получает `moonshotai/kimi-k3.1-pro:free` без изменений. Проверено на DSH Desktop 0.2.2-rc.3.

Ни установочных скриптов, ни демонов, ни лишних пакетов, ни ключа в Git.

## Бесплатный маршрут: суффикс `:free`

Numes разделяет бесплатные и платные endpoint'ы модели на **две разные записи каталога**:

- `author/model` — только платные endpoint'ы.
- `author/model:free` — только endpoint'ы, где **каждая ставка равна нулю** в валюте вашего ключа.

Согласно [документации Numes](https://numes.ai/docs/models#free-models), `:free` — это жёсткая гарантия: fallback никогда не переходит на платную сторону. Если ни один бесплатный endpoint не может взять запрос, вы получите `503 provider_unavailable`, и **списания не будет**. Бесплатный запрос не может молча стать платным.

Поэтому бесплатная настройка — это тот же ID модели с `:free` на конце. DSH считает это обычным ID модели.

**Грабли, на которые легко наступить:** «голый» ID вроде `moonshotai/kimi-k3.1-pro` теперь ведёт **только на платные** endpoint'ы. При нулевом балансе это `402 insufficient_credits`, а при наличии кредитов — реальное списание. Если нужен $0, суффикс `:free` не опционален.

Бесплатные запросы не безусловны: Numes требует подтверждённый email и применяет отдельные лимиты — `429 rate_limited` (смотрите `Retry-After`) или `403 verified_email_required`.

### Чего $0 не означает

Нулевая цена токена — это не «безлимит», не «мгновенно», не «приватно» и не «навсегда»:

- Бесплатные записи появляются и исчезают вместе с ценами провайдеров. Сегодня бесплатно — завтра платно, и «голая» запись начнёт списывать.
- Нулевая ставка ничего не говорит о хранении данных. Смотрите [политику данных Numes](https://numes.ai/docs/privacy/provider-data-policies), прежде чем отправлять приватный код или секреты.
- Задержка зависит от провайдера. В ручных замерах 17 ноября 2026 года эти бесплатные endpoint'ы иногда требовали **50–85 секунд** до первого токена, а tool-calls — дольше. Чуть позже короткий запрос вернулся примерно за 3 секунды. Ждите разброс, а не конкретное число.
- Датированное наблюдение: 17 ноября 2026 года USD-ключ видел девять `:free` текстовых моделей с tool-поддержкой, все — `amazee.ai / token-factory`. Это снимок, а не обещание, что эти девять будут существовать завтра.

Всегда проверяйте сами: `usage.cost`, [Activity](https://numes.ai/docs/account/activity) у Numes и `GET /api/v1/key`.

## Конфиг-файл (по желанию)

Обычному пользователю достаточно GUI. Если вы управляете профилем руками, [`configs/numes.patch.yml`](configs/numes.patch.yml) — стартовый блок для `cordis.patch.yml` профиля, по [официальному примеру адаптера](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md#configure-provider-routes).

Добавьте только запись `llm-pi-ai`, не заменяйте файл целиком. Ключа внутри нет: `apiKeyEnv: NUMES_API_KEY` — ссылка, которую DSH разрешает на каждый запрос.

Почему в конфиге только ID с `:free`: список моделей решает, какие ID DSH вообще может отправить, а `:free` решает, куда Numes имеет право их маршрутизировать. Для гарантированного нуля нужны оба.

## У Numes есть свой launcher

Numes описывает `numes run opencode` / `numes run pi`: ключ вставляется один раз, и launcher пишет конфигурацию этого клиента. Удобно для OpenCode, Pi и OMP — но профиль DSH он не создаёт. Для DSH просто используйте страницу Models, не ставьте ради этого ещё один агент. [Документация Numes](https://numes.ai/docs/integrations/coding-agents).

## Что может сломаться

| Симптом | Что это и что делать |
| --- | --- |
| `402 insufficient_credits` на «бесплатной» модели | Отправился «голый» ID, маршрут ушёл на платный endpoint. Добавьте `:free`, проверьте баланс и лимиты через `GET /api/v1/key`. |
| `429 rate_limited` | У бесплатных запросов свои лимиты. Дождитесь `Retry-After`, не повторяйте в цикле. |
| `403 verified_email_required` | Для бесплатных запросов Numes требует подтверждённый email. |
| `503 provider_unavailable` | Нет подходящего бесплатного endpoint'а прямо сейчас, endpoint нездоров или не поддерживает параметры. Обновите каталог, попробуйте другую `:free` модель или позже. |
| `401 invalid_credentials` | Неверный/отозванный/просроченный ключ либо management-ключ вместо inference. Создайте новый в [Keys](https://numes.ai/dashboard/keys); ключ никуда не публикуйте. |
| Модели нет в пикере | Повторите discovery и убедитесь, что ключ и маршрут сохранились. Ошибки ручной правки профиля видны в диагностике DSH. |
| Долгий старт | Замеряйте на спокойном запросе. Бесплатные endpoint'ы сильно разные; минута до первого токена — известное поведение, а не обязательно сломанный конфиг. |
| Пустой или обрезанный ответ | Поднимите лимит вывода, сократите контекст или возьмите другую `:free` модель. Reasoning-токены входят в output. |
| Какой endpoint реально обслужил | Смотрите поле `provider` в ответе и метаданные/логи генераций Numes. |

## Границы

- Проверялось обычными OpenAI-совместимыми запросами, стримингом usage и tool-calls на payload в форме кодинг-агента.
- Тестировалось на DSH Desktop 0.2.2-rc.3 (Windows) с USD-ключом. Это не сертификация всех релизов DSH, аккаунтов и деплойментов Numes.
- DSH и Numes меняются. После обновления перечитайте официальные документы; примеры здесь — датированная отправная точка.
- Применяется [Acceptable Use Policy](https://numes.ai/legal/acceptable-use) Numes. Гайд не автоматизирует регистрацию аккаунтов, решение капчи, сбор кредитов, распространение ключей или обход лимитов.
- Не связан с DeepSeek и Numes. Гарантий доступности, списаний, скорости, приватности и пригодности нет.

### Источники

- [Numes: Free models](https://numes.ai/docs/models#free-models) — контракт `:free`
- [Numes: Provider routing](https://numes.ai/docs/routing/provider-routing) · [Quickstart](https://numes.ai/docs/quickstart) · [Coding agents](https://numes.ai/docs/integrations/coding-agents)
- [DSH `llm-pi-ai`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md) · [DSH Models UI](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-settings-models/README.md)

Лицензия — [MIT](LICENSE). [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md).
