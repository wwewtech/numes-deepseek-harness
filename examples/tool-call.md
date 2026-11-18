# Tool calling

A complete, working tool-calling loop. This is what DSH does internally when a model says "call `read`, then call `edit`".

## 1. One-shot tool request

```bash
curl -s http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "numes-free-auto",
    "max_tokens": 1500,
    "reasoning": { "effort": "none" },
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather in a city",
        "parameters": {
          "type": "object",
          "properties": { "city": { "type": "string" } },
          "required": ["city"]
        }
      }
    }],
    "messages": [{ "role": "user", "content": "What is the weather in Paris?" }]
  }'
```

The model responds with `finish_reason: "tool_calls"` and a `tool_calls` array:

```json
{
  "choices": [{
    "finish_reason": "tool_calls",
    "message": {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_abc...",
        "type": "function",
        "function": { "name": "get_weather", "arguments": "{\"city\":\"Paris\"}" }
      }]
    }
  }]
}
```

## 2. Sending the tool result back

```bash
curl -s http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "numes-free-auto",
    "max_tokens": 1500,
    "tools": [ ...same tool... ],
    "messages": [
      { "role": "user", "content": "What is the weather in Paris?" },
      {
        "role": "assistant",
        "tool_calls": [ ...same tool_calls as the model returned... ]
      },
      {
        "role": "tool",
        "tool_call_id": "call_abc...",
        "content": "{\"temp_c\": 14, \"condition\": \"Cloudy\"}"
      }
    ]
  }'
```

Two rules that matter:

- The `tool_call_id` must match the id Numes generated.
- The second call re-sends the tool list — otherwise the model doesn't know the tool still exists.

## 3. Force a tool, or forbid any

```json
{ "tool_choice": "none", "tools": [...] }                             // never call tools
{ "tool_choice": "auto", "tools": [...] }                             // model decides
{ "tool_choice": { "type": "function", "function": { "name": "get_weather" } } }
```

DSH uses `auto` by default: it lets the agent decide whether a tool is needed.

## 4. Loop

Python, ~70 lines, full agent loop:

```python
import json, requests

URL = "http://127.0.0.1:8787/v1/chat/completions"
TOOLS = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get weather for a city",
        "parameters": {"type": "object", "properties": {"city": {"type": "string"}}},
    },
}]
cities_weather = {"Paris": {"temp_c": 14, "condition": "Cloudy"}}

def chat(messages):
    return requests.post(URL, json={
        "model": "numes-free-auto", "max_tokens": 1500,
        "tools": TOOLS, "tool_choice": "auto",
        "messages": messages,
    }, timeout=180).json()["choices"][0]["message"]

def run_tool(tc):
    if tc["function"]["name"] != "get_weather":
        return json.dumps({"error": "unknown tool"})
    city = json.loads(tc["function"]["arguments"])["city"]
    return json.dumps(cities_weather.get(city, {"error": "no data"}))

msgs = [{"role": "user", "content": "What is the weather in Paris?"}]
while True:
    msg = chat(msgs)
    msgs.append(msg)
    if msg.get("finish_reason") == "tool_calls" or msg.get("tool_calls"):
        for tc in msg.get("tool_calls", []):
            print("→ tool", tc["function"]["name"], tc["function"]["arguments"])
            msgs.append({
                "role": "tool", "tool_call_id": tc["id"], "content": run_tool(tc)
            })
    else:
        print(msg["content"])
        break
```

Each pass adds **one** message from the model and **one** from each tool. The loop stops when `finish_reason` is `stop` — the model has its final answer.
