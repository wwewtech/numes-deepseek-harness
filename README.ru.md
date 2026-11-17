# Numes в DeepSeek Harness

Подключите [Numes](https://numes.ai) к [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) штатными средствами — **без собственного плагина**.

## Два часа работы? Нет, всё проще

1. Получите **inference-ключ** на [Numes → Keys](https://numes.ai/dashboard/keys).
2. В DSH откройте **Settings → Models → Add model provider → Custom model API**.
3. Заполните:
   | Поле | Значение |
   | --- | --- |
   | Provider ID | `numes` |
   | Protocol | **OpenAI Chat Completions** |
   | Endpoint | `https://api.numes.ai/api/v1` |
   | API key | ваш `sk-numes-v1-…` |
4. Нажмите **Fetch available models**, отметьте нужные модели, затем **Update list**.
5. В композере выберите `numes/moonshotai/kimi-k3.1-pro` или другую модель.

Ключ сохраняется один раз в штатном хранилище DSH. В Git его не кладут. Альтернатива — передать `NUMES_API_KEY` процессу при запуске DSH.

`numes/moonshotai/kimi-k3.1-pro` — это путь внутри DSH. При вызове API получает оригинальный `moonshotai/kimi-k3.1-pro`.

Проверено на DSH Desktop 0.2.2-rc.3: конфигурация вида `llm-pi-ai` заработала с текущей версией Numes. Это не сертификация каждого релиза и не гарантия доступности конкретных endpoint'ов в дальнейшем.

## Бесплатный вариант, без красивых обещаний

**$0 означает нулевую цену input/output конкретного предложения, а не вечный free tier.**

17 ноября 2026 года ручной скан всех 154 моделей, доступных одному USD-ключу, нашёл девять `$0` tool-capable предложений. Все тогда были на `amazee.ai / token-factory`. Это датированное наблюдение, а не общее правило и не скрытая реклама.

Сегодня endpoint есть — завтра он может исчезнуть, начать ошибаться или внести ограничения. Конкретные квоты и политика данных зависят от Numes и провайдера. Читайте [модели и цены](https://numes.ai/docs/models) и [политику данных](https://numes.ai/docs/privacy/provider-data-policies).

- У одной модели могут быть одновременно бесплатный и платный endpoint'ы.
- **Fetch available models** лишь получает идентификаторы, не доказывает бесплатность каждого маршрута.
- Смотрите `usage.cost`, собственный баланс и логи Numes, не полагайтесь на слово «бесплатно» в интернете.
- Для любых списываемых средств используйте отдельный ключ и лимит расходов.

### Ручной пример «строго бесплатно»

Для прямого Chat Completions запроса можно указать конкретный endpoint и предельную цену за токен:

```json
"provider": {
  "only": ["PROVIDER-SLUG/ENDPOINT-ID"],
  "max_price": { "prompt": 0, "completion": 0 }
}
```

Текущий tag берут из `GET /api/v1/models/{author}/{slug}/endpoints`. Не копируйте слепо tag из старого поста. Источник: [Numes Provider routing](https://numes.ai/docs/routing/provider-routing). Это пример **прямого API-запроса**, не универсальное поле в интерфейсе DSH.

### Скорость

При измерениях первые токены иногда приходили через **50–85 секунд**, отдельные tool-calls занимали больше времени. Для пробной интеграции или необязательных фоновых задач это приемлемо, для оперативной работы — часто нет. Бесплатные предложения не означают высокую доступность.

## Если любите конфиг файлы

[`configs/numes.patch.yml`](configs/numes.patch.yml) — пример маршрута `llm-pi-ai` для `cordis.patch.yml` desktop-профиля. Он **не заменяет весь файл**: добавьте только нужную секцию, сохраните свои остальные настройки и провалидируйте схему соответствующей версии DSH.

`NUMES_API_KEY` в нём — имя ссылки на ключ, а не сам ключ. Для обычного пользователя GUI выше проще и приоритетнее.

## Где действительно есть однократный диалог ключа

У Numes есть показанный [вариант `numes run pi` / `numes run opencode`](https://numes.ai/docs/integrations/coding-agents): при первом запуске можно вставить существующий ключ или создать новый через браузер. Это естественный путь для **OpenCode, Pi и OMP**. Он не пишет профиль DSH; для DSH достаточно родной Models-страницы, установки ради этого не требуется.

## Что может сломаться

| Симптом | Что сделать |
| --- | --- |
| `401 invalid_credentials` | Проверьте тип и состояние ключа в Numes. Не высылать ключ в issue. |
| `402 insufficient_credits` | Выбранный маршрут платный, либо достигнут лимит. Смотрите цены и `GET /key` у Numes. Не повторять бесконечно. |
| `503 provider_unavailable` | Провайдер перегружен, endpoint unhealthy или не поддерживает требуемые инструменты/параметры. Выбрать другую модель или повторить позже. |
| Долго ждало ответа | Проба другого предложения, проверьте DSH таймауты и Numes статистику. Постоянных гарантий скорости нет. |
| Модель отдаёт tools/ошибки | Проверьте `/models` и `/models/{author}/{slug}/endpoints`, достаточен ли output limit, сохранились ли изменения каталога. Сократите контекст или выберите другую модель. |

К конкретным проблемам маршрута полезен `X-Request-Id`. Никаких секретов и приватных диалогов во вложениях и отчётах.

## Статус

Неофициальный общественный гайд от [wwewtech](https://github.com/wwewtech). **Не официальный плагин/поддержка Numes или DeepSeek**, без автоматического создания аккаунтов, обхода CAPTCHA/лимитов, сбора или распространения чужих ключей.

Применяются [Terms Numes](https://numes.ai/legal/terms), [Acceptable Use](https://numes.ai/legal/acceptable-use) и [DSH license](https://github.com/deepseek-ai/deepseek-harness/blob/master/LICENSE).

## Источники

- [Официальный адаптер DSH `llm-pi-ai`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md)
- [Официальная страница DSH Models](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-settings-models/README.md)
- [Numes Quickstart](https://numes.ai/docs/quickstart) · [Модели](https://numes.ai/docs/models) · [Routing](https://numes.ai/docs/routing/provider-routing) · [Coding agents](https://numes.ai/docs/integrations/coding-agents)

Лицензия — [MIT](LICENSE). [Обновление/предложения](CONTRIBUTING.md).
