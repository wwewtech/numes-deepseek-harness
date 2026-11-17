# Numes → DeepSeek Harness

**Начните установку здесь: [полный пошаговый гайд](docs/SETUP.ru.md).**
English: [README.md](README.md) · [Full guide](docs/SETUP.md)

Это не плагин, а доcументированный способ добавить Numes в уже существующий DSH через `Settings → Models` с маршрутом `llm-pi-ai`.

## Краткая установка

1. [Numes → Keys](https://numes.ai/dashboard/keys) → **Create key** → **Inference** → валюта, например USD → скопируйте один раз показанный секрет.
2. DSH → **Settings → Models → Add model provider → Custom model API**.
3. Введите:
   - Provider ID: `numes`
   - Base URL: `https://api.numes.ai/api/v1`
   - Protocol: **OpenAI Chat Completions**
   - API key: ваш inference-ключ
4. **Fetch available models** → выберите записи **`:free`** → **Update list** → сохраните.
5. В пикере выберите `numes / moonshotai/kimi-k3.1-pro:free`; отправьте `Ответь ровно одним словом: PONG`.

**Плагин и дополнительный баланс не нужны.** Нужны DSH, Numes account с подтверждённым email и inference-ключ.

## Не ошибитесь в ID

`moonshotai/kimi-k3.1-pro` — только платный endpoint. Для бесплатных запросов берите `moonshotai/kimi-k3.1-pro:free`. `:free` не переходит на платный endpoint: если бесплатных нет — `503`, нулевое списание по текущей гарантии Numes.

При **`QUOTA` / `402`** проверьте прежде всего модель ID и выбранный маршрут, а не бросайтесь пополнять баланс. При `429` уважайте `Retry-After`, при `503` обновите список, проверьте другой текущий free endpoint.

## Содержимое полного руководства

- Как запустить DSH Desktop или официальной `npx @deepseek-ai/dsh web`.
- Как создать и ограничить inference-ключ.
- Что именно нажимать в Models UI и как сохранить список бесплатных моделей.
- Как проверить модель, tool-calls и настоящую стоимость `usage.cost`.
- Когда уместен YAML, где настоящий `cordis.patch.yml`, как сохранить старые настройки и сделать откат.
- Как очистить позднее изменившийся ключ: локально сохранённый credential приоритетнее environment.
- Retry, timeout, rate limit, reasoning/token limits, privacy и логи.

**[Читать полную инструкцию установки](docs/SETUP.ru.md).**

Готовый блок конфигурации: [`configs/numes.patch.yml`](configs/numes.patch.yml). Не копируйте им ваш реальный профиль целиком, добавляйте только блок провайдера. Ключ в сетевых docs/файлах не содержится и не должен содержаться.

## Бесплатный вариант — честно

$0 не означает «безлимит, мгновенно, навсегда или приватно». Доступность free-предложений не гарантирована по времени, скорости и квоте. В ручных замерах 17 ноября 2026 года первые токены бесплатных endpoints шли ~50–85 с, позднее короткий запрос Kimi `:free` ответил `PONG` с `cost: 0` примерно за 3 секунды. Наблюдения не обещают вашего результата. Приватные данные отправляйте только после чтения [политик Numes/провайдеров](https://numes.ai/docs/privacy/provider-data-policies).

## Официальные источники

[Numes keys](https://numes.ai/docs/account/api-keys) · [Free models](https://numes.ai/docs/models#free-models) · [DSH models & UI installation](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md) · [Numes errors](https://numes.ai/docs/api-reference/errors)

Репозиторий не связан с DeepSeek и Numes. Без автоматической регистрации, CAPTCHA, массовых аккаунтов, чужих ключей и обхода лимитов. [MIT](LICENSE) · [SECURITY](SECURITY.md).
