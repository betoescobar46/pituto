# pituto

**Five mods that take the friction out of Claude Code.**

Answer Claude's questions with a click. Quote the paragraph you mean. Keep compact, clear and effort one button away. Know which project you're in by its color. Read wide tables as tables.

![inline-replies: click an answer, click an option, Enter](img/inline-replies.gif)

```bash
claude plugin marketplace add betoescobar46/pituto
claude plugin install inline-replies@pituto     # or any of the five
```

Then restart Claude Code (`/exit`, `claude --continue`). Every screenshot below is real: two identical sessions, one with the mods off and one with them on.

---

## Answering Claude's questions

Claude lists four decisions. You re-read them and type an answer that points at each one by number: "1: both… 4: several…".

**Before**

![Three questions in prose, answered by typing a long sentence](img/questions-before.png)

**With `inline-replies`**

Claude's questions become clickable where they appear. Click **①** to open your answer line, or click one of the alternatives, drawn as keys on their own line, and it's written for you. Add free text underneath. Unanswered questions take the option Claude recommended, marked with ★.

**Silence never authorizes anything irreversible.** A question about deleting, pushing, sending, paying or overwriting never gets a default: it needs an explicit answer.

![Questions numbered, their alternatives as keys, and the prompt filled by clicks](img/questions-after.png)

Everything lands in the prompt as plain text. Edit it, then Enter.

## Pointing at part of the answer

**Before**

Select, copy, paste between quotes, and hope Claude knows which paragraph you meant.

![A manual quote typed into the prompt](img/quote-before.png)

**With `inline-replies`**

Each paragraph has a **❝** in the margin. Click it and a one-line hint goes into the prompt; Claude receives the whole paragraph, in order, with your comment. Select text with the mouse and press **❝+** to quote exactly that.

![The paragraph quoted with one click, comment typed underneath](img/quote-after.png)

## Compact, clear, effort, model

**Before**

Remember the command, type it, pick it from a menu.

![The slash-command menu after typing /comp](img/bar-before.png)

**With `session-bar`**

One button each, under the prompt. **C** compacts (second click confirms, and a percentage shows progress). **⌫** clears (second click confirms; there's no undo). **L M H XH Mx** sets the effort and the model name opens the model picker: both change Claude Code's own setting (what `/model` shows), and like typing `/effort` or `/model` they also save it as the default for new sessions. Set the `keepDefaults` option to `on` to keep clicks to this session only: the mod then puts the previous default back in `~/.claude/settings.json` after each click (a change another session saves to the same keys within those seconds can be lost). Change either in `/model` or `/effort` and the bar follows. **◧** opens a side chat for a quick question that doesn't interrupt the task.

![The session bar with compact, clear, color, model and effort](img/bar-after.png)

## Knowing where you are

**Before**

Four terminals, four Claude Codes, all the same.

![Three identical prompts](img/colors-before.png)

**With `session-bar`**

Each folder gets its own color: the prompt line, the folder name and the dot. Open a session in that folder tomorrow and it's the same color. Pin the ones you care about in `/config`, or in `settings.json`:

```jsonc
// ~/.claude/settings.json
"pluginConfigs": {
  "session-bar@pituto": { "options": { "folderColors": "api=cyan, shop=purple, admin=orange" } }
}
```

Other folders get a stable color of their own, never one of the pinned ones.

![Three prompts, each with its folder name and color](img/colors-after.png)

## Wide tables

**Before**

When a table doesn't fit, Claude Code gives up and prints it as a vertical list. Comparing six options across six criteria becomes a scroll.

![A 6×6 comparison collapsed into a vertical list](img/table-before.png)

**With `grid-tables`**

The table stays a table. Columns get the width their words need and the rest is shared out, so cells wrap at word boundaries.

![The same comparison as a grid](img/table-after.png)

## Reading the conversation

**Before**

![Tool summary and duration line in the same weight as the answer](img/quiet-before.png)

**With `quiet-lines` and `message-times`**

The tool summary and the "Worked for" line go faint and italic, so the answer is what you see. Each of your messages carries the time you sent it.

![The same turn with faint secondary lines and a timestamp](img/quiet-after.png)

---

## The five mods

| Mod | One line |
|---|---|
| `inline-replies` | Questions you answer with a click; paragraphs you quote with a click |
| `session-bar` | Side chat, compact, clear, effort, model and a color per folder |
| `grid-tables` | Markdown tables as a grid at any width |
| `quiet-lines` | Secondary lines in faint italic |
| `message-times` | The time next to each of your messages |

Install them separately or all together. They don't depend on each other.

## Settings

Every option lives in `/config`, under the mod's name.

| Mod | Option | What it does |
|---|---|---|
| `inline-replies`, `session-bar` | `language` | `auto` follows Claude Code's `language` setting (or your locale): Spanish stays Spanish, anything else is English. `en` or `es` pin it. |
| `session-bar` | `folderColors` | The pinned colors above. |
| `session-bar` | `persona` | One sentence added to the standalone side chat, e.g. "The user is a cardiologist: answer clinical questions at specialist level." |

## Notes

- Works in any terminal. Tested in cmux and Ghostty on macOS.
- MIT.

*Hecho en Chile.* — [versión en español](README.es.md)
