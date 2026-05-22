# AGENTS.md — 求职投递追踪 (Job Tracker Chrome Extension)

## No build step
This is a vanilla JS Chrome Manifest V3 extension. There is no build tooling, no package.json, no TypeScript, no linting, and no test suite. Edit the `.js`, `.html`, `.css` files directly and reload the extension in `chrome://extensions/`.

## How to load the extension
1. Go to `chrome://extensions/`
2. Enable "Developer mode" (toggle top-right)
3. Click "Load unpacked" → select this repo's root directory
4. After code changes, click the reload icon on the extension card

## Architecture

```
manifest.json        → defines permissions, popup, options page
lib/deepseek.js      → DeepSeek API wrapper (extractJobInfo, analyzeJD)
lib/seatable.js      → SeaTable API client class (auth, appendRow, listRows)
popup/popup.{html,js,css} → extension popup UI and orchestration logic
options/options.{html,js,css} → API key + server config page
assets/SourceHanSerifSC.otf → custom serif font (referenced by both CSS files via @font-face)
```

## Permissions & APIs in use
- `activeTab` + `scripting` — `chrome.scripting.executeScript` injects `() => document.body.innerText` to read page content
- `storage` — settings and custom statuses (see below)
- Host permissions: `api.deepseek.com`, `cloud.seatable.io`, `cloud.seatable.cn`
- No service worker, no content scripts, no background page

## Storage conventions
- `chrome.storage.sync` — all user-facing settings: `deepseekKey`, `seatableServer`, `seatableToken`, `seatableTable`
- `chrome.storage.local` — custom status strings under key `customStatuses` (an array). Statuses are added here when user submits a custom value in the form, then populated into the dropdown on next use.

## LLM patterns
- Model: `deepseek-v4-flash` with `response_format: { type: 'json_object' }`
- Page text is truncated to 8000 chars for job extraction, 12000 chars for JD analysis (no chunking)
- Extraction failure is a **soft error**: the popup falls back to an empty form with today's date `getTodayStr()`, user can fill manually
- JSON parsing fallback: tries `JSON.parse(content)` first, then regex `\{[\s\S]*\}` as fallback for markdown-wrapped JSON

## SeaTable API flow
1. `getBaseToken()` — GET `/api/v2.1/dtable/app-access-token/` with API Token → returns JWT base token + `dtable_uuid`
2. `appendRow()` — POST `/api-gateway/api/v2/dtables/{uuid}/rows/` with `{ table_name, rows: [rowData] }`
3. `hasDuplicateLink()` — calls `listRows()` (GET all rows) and checks `row['链接'] === link`. If the query fails, it silently returns `false` (doesn't block save).

## Popup state machine
The popup has these view states, toggled via `showState()`:
`state-home` → `state-loading` → `state-form` | `state-jd` | `state-success` | `state-error` | `state-noconfig`

Two independent modes share the loading/error states. The `currentMode` variable (`'track'` or `'jd'`) is used for retry routing.

## Form field mapping (SeaTable column names)
| HTML field ID | SeaTable column | Type |
|---|---|---|
| company | 公司 | 文本 |
| position | 岗位 | 文本 |
| status-select / status-custom | 状态 | 单选 |
| location | 地点 | 文本 |
| link | 链接 | URL |
| apply-date | 投递日期 | 日期 |
| intro | 自我介绍 | 长文本 |

The SeaTable table also has two auto-managed columns that the extension does NOT write to:
- `更新日期` (last modification time, SeaTable managed)
- `泡池子时间` (formula: `DATETIME_DIFF(TODAY(), {投递日期}, 'days')`)

## Duplicate detection
Before saving, `hasDuplicateLink()` checks if the same URL already exists. If found, a `confirm()` dialog asks whether to proceed. This fetches **all rows** from the table each time — could be slow on large tables.
