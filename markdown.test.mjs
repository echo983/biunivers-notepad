import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdown, safeHref } from "./markdown.mjs";

test("parses common Markdown blocks without interpreting HTML", () => {
  assert.deepEqual(
    parseMarkdown(
      "# Title\n\nText with **weight**.\n\n- one\n- two\n\n```js\nalert(1)\n```",
    ),
    [
      { type: "heading", level: 1, text: "Title" },
      { type: "paragraph", text: "Text with **weight**." },
      { type: "list", ordered: false, items: ["one", "two"] },
      {
        type: "code-block",
        language: "js",
        text: "alert(1)",
      },
    ],
  );
  assert.equal(parseMarkdown("<script>alert(1)</script>")[0].text, "<script>alert(1)</script>");
});

test("allows ordinary links and rejects executable protocols", () => {
  assert.equal(safeHref("https://example.com"), "https://example.com");
  assert.equal(safeHref("./notes.md"), "./notes.md");
  assert.equal(safeHref("#section"), "#section");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,test"), null);
});
