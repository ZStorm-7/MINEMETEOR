# Teach FindCraft

FindCraft's knowledge lives HERE, in plain files - not inside any AI or API key. Every AI (Groq, Gemini, Claude, Pollinations...) gets the
same lessons, so when you add or swap an API key there is nothing to re-teach. Run `npm run quiz` to prove a key answers correctly.

Two kinds of files (`.md` or `.txt`, save and it is live - no restart needed on a self-hosted server):

- `core-*.md` - ALWAYS in the AI's prompt. Keep these short (a few hundred words total): free AI tiers have tiny token limits.
  Good for: facts the AI keeps getting wrong, wiki host lists, rules like "version names have no leading 1.".
- every other file - searched ON DEMAND (the `search_minecraft` tool looks inside them). Add as much as you like: your server's rules,
  seasons, staff, lore, strategies, tier lists. Short bullet points under `# headings` work best.

Tips: put dates on things that change; one topic per heading; write the way a player would ask ("How do I join?").
Example: see `example-server.md.disabled` (rename it to `.md` to switch it on).
