---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines (Vercel Web Interface Guidelines).

## How It Works

1. Check local rules in [guidelines.md](file:///d:/COFFEE/.agents/skills/web-design-guidelines/guidelines.md) (or optionally fetch fresh guidelines from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`).
2. Read the specified files or UI components.
3. Check against all rules in the guidelines:
   - Accessibility (aria-label, keyboard handlers, semantic tags, alt text, skip links)
   - Focus States (visible focus, :focus-visible, no bare outline-none)
   - Forms (autocomplete, correct types, paste protection, inline errors)
   - Animation (prefers-reduced-motion, no transition: all, transform/opacity only)
   - Typography (… ellipsis, balanced headings, tabular-nums)
   - Content Handling (truncation, min-w-0 on flex children, empty states)
   - Images (explicit width/height, lazy loading)
   - Performance (virtualization for >50 items, no layout thrashing)
   - Dark Mode & Theming (color-scheme, theme-color)
   - Anti-patterns check
4. Output findings in the terse `file:line` format.

## Usage

When the user asks to review UI files or check guidelines compliance:
- Read target files (e.g. `coffee-app/src/components/...`)
- Check against rules in [guidelines.md](file:///d:/COFFEE/.agents/skills/web-design-guidelines/guidelines.md)
- Output findings using the terse `file:line` format.
