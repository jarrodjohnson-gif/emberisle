# Markdown examples and label commands (#977)

Base: `0fbaf3b9fb2ed40cb4495c1ac68aa7e390588363`. Node: 22.23.4.

Commands and reservation metadata use one `visibleBody` filter. Four-column
indentation (including tabs expanded to four-column stops) is always an example.
List-contained backtick/tilde fences hide their content until a matching closer
or a dedent out of the list container. Backtick fence headers containing a
backtick are ordinary text, so they cannot swallow later real commands. Tilde
headers may contain backticks. Visible lines retain their original text;
authority metadata keeps its existing column-zero rule.

This is a conservative command-input contract, not a general Markdown renderer.
Four-column lines are ignored even immediately after a paragraph; CommonMark
indented code cannot interrupt a paragraph, but the bot deliberately grants no
command authority to those indented lines. `files:` is not an authority field
consumed by this workflow; its example lines are covered with claim identities.
Authorization, chronological replay, release identities, PR association checks,
workflow permissions and command names are unchanged. No new dependency or
workflow dispatch is needed.

`baseline.log`: all 26 original workflow groups passed. `regression-before.log`:
the original parser reacted to a four-space example command; the new no-reaction
assertion failed (`true !== false`). `final.log`: all 32 groups passed. The six
new groups cover indented commands/metadata, bullet/ordered/nested list fences,
container dedents, insufficient fence closers, authority metadata, and invalid
backtick versus valid tilde headers. Every original assertion remains unchanged.
`registered.log`: all 175 proofs remain registered in package.json and CI.

Commands used:

```
npm exec --yes --package=node@22.23.4 -- node scripts/label-commands-prove.mjs
npm exec --yes --package=node@22.23.4 -- node scripts/registered-prove.mjs
node --check scripts/label-commands-prove.mjs
```

These fixtures execute the deployed inline JavaScript with mocked paginated
GitHub APIs. They do not post comments, alter labels, or dispatch workflows.
Hosted CI and independent Claude/owner review remain separate gates.

Parent review then identified continuation-line list fences. The new mocked
case reproduced an exposed example command before the fix (`continuation-before.log`).
The scanner now retains nested list content indentation across lines and parses
fences after deindenting their actual container. Tests cover bullet, ordered,
nested, closed and dedented-unclosed forms, including real commands afterward.
The first attempt included a legitimate outside `/paused`, whose approval made
a no-reaction assertion invalid; `continuation-original-attempt.log` retains
that failure and `continuation-fixture-correction.log` retains the subsequent
run before the additional real-command cases. No prior group/assertion changed.
