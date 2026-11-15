# jsonlens

A fast, private JSON workbench that runs entirely in your browser.

**Live:** https://1252387328.github.io/jsonlens/

- **Validate** with errors that say *what* is wrong and *where*: `trailing comma before "}" at line 4, column 3`,
  `keys must use double quotes`, `undefined is not valid JSON` — with a caret under the exact column
- **Format / minify**, 2 or 4 spaces or tabs, optional recursive key sorting
- **Tree view** with collapsible nodes that renders large documents lazily
- **Path queries**: `$.store.books[*].title`, `$.items[-1]`, `$["key with spaces"]` — click any key to get its path
- Syntax-highlighted text view, copy to clipboard, structure stats
- No uploads, no tracking, no build step, no dependencies

## Path syntax

| Path | Meaning |
| --- | --- |
| `$` | the whole document |
| `$.a.b` | key `b` inside key `a` |
| `$.list[0]`, `$.list[-1]` | first / last array item |
| `$.list[*].id` | `id` of every item |
| `$.obj.*` | every value of an object |
| `$["odd key"]` | keys that are not identifiers |

## Use the library

`src/jsonlens.js` is a small ES module that works in Node 18+ as well:

```js
import { parse, query, format } from './src/jsonlens.js';

parse('{"a": 1,}');
// JsonError: trailing comma before "}" at line 1, column 9   (err.line === 1, err.column === 9)

query(parse('{"books":[{"t":"A"},{"t":"B"}]}'), '$.books[*].t');   // ['A', 'B']
format({ b: 1, a: 2 }, { indent: 2, sort: true });
```

## Run locally

```bash
npm start   # then open http://localhost:8000
npm test
```

## License

MIT
