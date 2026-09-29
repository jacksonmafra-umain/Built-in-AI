# Built-in AI Demo

A small, dependency-free web page that runs **Gemini Nano on-device in Chrome** through the
[Prompt API](https://developer.chrome.com/docs/ai/prompt-api). Inference happens in the browser: no
server, no API key, and no prompt data leaves the machine.

It is built as a live demo for a team walkthrough. Every Prompt API call the page makes is printed in
an **API calls** log and counted in the header, so the audience can follow what happens.

## What it shows

| Feature | API surface | Where |
| --- | --- | --- |
| Availability check and one-time model download with progress | `LanguageModel.availability()`, `create({ monitor })` | Model status card |
| Streaming chat with a stop button | `session.promptStreaming()`, `AbortController` | Chat tab |
| System prompt | `initialPrompts` with a `system` role | Chat → System prompt |
| Image and microphone input | `expectedInputs: [{ type: 'image' }, { type: 'audio' }]` | Chat composer |
| Context window meter and overflow warning | `contextUsage`, `contextWindow`, `contextoverflow` | Chat, above the messages |
| Several conversations, fork, free, delete | `session.clone()`, `session.destroy()` | Chat → Sessions |
| Restore after reload | `localStorage` + replay through `initialPrompts` | Chat → Sessions |
| Session compacting | `Summarizer` API (falls back to a Prompt API session) | Chat → Compact session |
| Structured output | `prompt(input, { responseConstraint: jsonSchema })` | Structured output tab |

The retro terminal look is plain text and CSS: the animated background is ASCII drawn on a canvas,
and the CRT effect uses CSS gradients. There are no image assets. The background reacts to
streamed tokens, and the **display** bar toggles motion, rain, glitch, CRT and the color palette.

## Requirements

- Desktop Chrome 138 or newer, on Windows 10/11, macOS 13+, Linux, or ChromeOS on a Chromebook Plus.
- At least 22 GB of free disk space for the model. Chrome removes the model if free space drops below 10 GB.
- A GPU with more than 4 GB of VRAM, or 16 GB of RAM and 4+ CPU cores. Audio input needs a GPU.
- An unmetered connection for the first download.

If `LanguageModel` is missing, enable these flags and restart Chrome:

- `chrome://flags/#prompt-api-for-gemini-nano`
- `chrome://flags/#optimization-guide-on-device-model`

`chrome://on-device-internals` shows the model state and download progress.

## Running it

The page uses ES modules, so it has to be served over HTTP (not opened as a `file://` URL).
`localhost` counts as a secure context.

```sh
python3 -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

## Suggested walkthrough

1. **Model status.** Show the per-modality availability badges. On a fresh profile, click
   *Download Gemini Nano* and point out that downloading requires a user gesture.
2. **Chat.** Ask a question and watch tokens stream in. The background swells while tokens arrive.
   Ask for something long and hit *Stop* to show `AbortController`.
3. **System prompt.** Change it (for example "Answer like a pirate"), start a *New* session and compare.
4. **Multimodal.** Attach a screenshot and ask what is on it, or record a question with the microphone.
5. **Context window.** Keep chatting and watch the meter fill. Explain that on overflow the oldest turns
   are dropped silently, while the system prompt stays.
6. **Compact.** Click *Compact session*. The older turns become a summary in the system prompt, and the log
   shows the token count before and after.
7. **Sessions.** *Clone* the chat and take the two branches in different directions. *Free* one to release
   its memory, then keep typing: the history is replayed into a new session. Reload the page: the
   sessions are still there.
8. **Structured output.** Run the presets. The model is constrained to the JSON Schema during decoding,
   so `JSON.parse()` on the reply is safe. The hashtag preset shows a regex `pattern`.

## Notes and limitations

- Gemini Nano currently supports English, Japanese, Spanish, German and French. The demo declares `en`
  for input and output; declaring an unsupported language makes `create()` fail.
- `temperature` and `topK` are only available to Chrome Extensions. Web pages get the defaults
  (a `samplingMode` option exists behind an origin trial), so the demo does not expose them.
- Older Chrome builds call the context properties `inputUsage` / `inputQuota` and fire `quotaoverflow`.
  The demo reads both names.
- Only text is persisted across reloads. Attached images and audio show up as `[Attached: image]` in the
  replayed history.
- The API is not available in Web Workers, and cross-origin iframes need `allow="language-model"`.

## Project structure

```
index.html              markup for every panel
styles.css              terminal theme, palettes, layout
js/main.js              wires the features together once the model is ready
js/lib/model.js         thin wrapper around LanguageModel
js/lib/log.js           the visible API call log
js/lib/tabs.js          tab bar built from the panels
js/lib/backdrop.js      animated ASCII canvas background
js/features/*.js        one module per demo feature
```

## References

- [Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- [Session management best practices](https://developer.chrome.com/docs/ai/session-management)
- [Session compacting](https://developer.chrome.com/docs/ai/session-compacting)
- [Structured output for the Prompt API](https://developer.chrome.com/docs/ai/structured-output-for-prompt-api)
- [Summarizer API](https://developer.chrome.com/docs/ai/summarizer-api)

## Credits

- The idea for this demo came from the Web AI examples in
  [Engenharia de Software com IA Aplicada, module 01](https://github.com/unipds-engenharia-de-ia-aplicada/engenharia-de-software-com-ia-aplicada/tree/main/modulo01-fundamentos-de-ia-e-llms-para-programadores)
  by UniPDS, published under
  [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/), and from an earlier prototype
  based on them by [Delfio Francisco](https://www.linkedin.com/in/delfio-francisco/).
  This repository contains none of their code. It is a separate implementation written from the
  official Chrome documentation listed above.
- API behavior, requirements and code patterns follow the Chrome for Developers documentation by Google.
- The visual style was inspired by an ASCII-art music visualizer on CodePen by
  [jacksonfdam](https://codepen.io/jacksonfdam).

## License

[MIT](LICENSE) © 2026 Jackson Mafra. This covers the code in this repository only, not the referenced
third-party materials.
