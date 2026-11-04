#!/usr/bin/env node
// Sorts the Backlog issues from backlog.graphql (on stdin) for the linear-task skill, lowest number first:
//   review   new, or the user commented or edited the description after the last 🤖 comment
//   waiting  has an open question (Trenger mer oppfølging or Trenger avklaring) and nothing new from the user
//   read     already read and ready for Todo, with nothing new
// Issues with "Mer arbeid" and no open question are left out: poll.graphql picks those up as work.
// The 🤖 comments are the only record of what has been read, so there is no state file to keep in step.

import { readFileSync } from 'node:fs';

const BOT = '🤖';

function hasNews({ comments, history }) {
  const latest = comments.nodes[0];
  if (!latest?.body.startsWith(BOT)) return true;
  return history.nodes.some(h => h.updatedDescription && h.createdAt > latest.createdAt);
}

const out = { review: [], waiting: [], read: [] };
const { nodes } = JSON.parse(readFileSync(0, 'utf8')).issues;
for (const issue of nodes.sort((a, b) => a.number - b.number)) {
  const labels = issue.labels.nodes.map(l => l.name);
  const open = labels.includes('Trenger mer oppfølging') || labels.includes('Trenger avklaring');
  if (labels.includes('Mer arbeid') && !open) continue;
  if (hasNews(issue)) out.review.push(`${issue.identifier} ${issue.title}`);
  else (open ? out.waiting : out.read).push(issue.identifier);
}
console.log(JSON.stringify(out));
