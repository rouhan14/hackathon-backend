# Demo Video Script (2 minutes)

A shot-by-shot script for the demo video. Total runtime is about 120 seconds. Everything is shown through the frontend, but the voiceover explains what is happening behind it so judges understand the depth, not just the UI.

Two golden rules:
- Have everything connected and logged in before you hit record. Do not burn demo time on OAuth popups.
- Pre-pick prompts you have already tested so the AI behaves. Have a Notion page called "Q3 Roadmap" with 3 or 4 clear bullet-point initiatives ready in the workspace.

---

## The timing at a glance

| Time | Segment | What is on screen |
|---|---|---|
| 0:00 - 0:15 | The hook / problem | App landing or dashboard |
| 0:15 - 0:30 | What it is + connected apps | Integrations page |
| 0:30 - 0:55 | Demo 1: read across apps | Chat, a cross-app question |
| 0:55 - 1:30 | Demo 2: the cross-app action | Chat, Notion to Jira, then Jira open |
| 1:30 - 1:50 | Under the hood (the real depth) | Tool trace, quick architecture nod |
| 1:50 - 2:00 | Close + Codex credit | Back to dashboard |

---

## The script

### 0:00 - 0:15  The hook

**On screen:** Your app open on the main dashboard or chat screen. Clean, nothing cluttered.

**Voiceover:**
"Everyone's work is scattered. Your tickets are in Jira, your specs are in Notion, your sprint is in ClickUp. Nobody has the full picture, and you spend your day switching tabs and copy-pasting between them. We built one AI brain that sits on top of all of it."

**Tip:** Say this over a slow, confident mouse movement. Do not click anything yet.

---

### 0:15 - 0:30  What it is and what's connected

**On screen:** Click into the Integrations / Connections page. Show Jira, Notion, and ClickUp all connected with a green or active status.

**Voiceover:**
"You connect your real accounts with your own permissions, over OAuth. Right now we support Jira, Notion, and ClickUp, all through their official servers. Your tokens are encrypted and never leave our backend, and the AI never sees them."

**Tip:** Let the connected list sit on screen for a beat. It proves these are real integrations, not mockups.

---

### 0:30 - 0:55  Demo 1, reading across apps

**On screen:** Go to the chat. Type a question that clearly needs live data from more than one app, for example:

> "What am I working on right now across Jira and ClickUp?"

Let it run. Show the answer coming back with real items pulled from the tools.

**Voiceover:**
"Now I just ask, in plain English. The brain figures out which apps it needs, calls the right tools, and pulls live data. Here it's reading my actual open work from two different systems and giving me one answer. I never told it which tool to use. It decided."

**Tip:** Pick a question you have already run so you know the results are clean. If the answer is a nice bullet list, even better.

---

### 0:55 - 1:30  Demo 2, the wow moment (cross-app action)

**On screen:** This is the money shot. In chat, type:

> "Read my Q3 Roadmap page in Notion and create a Jira task for each initiative on it."

Let it work. Then, and this is important, switch tabs or windows over to the real Jira board and show the new tickets that just appeared.

**Voiceover:**
"This is the part I'm proud of. One sentence, two apps. It reads my roadmap page out of Notion, understands the initiatives, and then creates a real Jira ticket for each one. Let me show you Jira itself. There they are. It didn't just talk about doing it. It actually did it, and I can verify it at the source."

**Tip:** The cut to the live Jira board is the single most convincing thing in the video. Do not skip it. Rehearse the tab switch so it's fast.

---

### 1:30 - 1:50  Under the hood

**On screen:** Back in your app, show the tool-trace / activity part of the response if your frontend surfaces it (the list of tool calls like `notion_search`, `jira_create_issue`). If the frontend doesn't show it, show a quick glance of the response detail or briefly cut to the architecture diagram.

**Voiceover:**
"Under the hood this isn't a wrapper around a chatbot. Every action runs through a policy engine, destructive operations are blocked by default, and every request is logged as an auditable run. We modeled the whole thing as a work graph so it's built to scale to real teams, not just a demo."

**Tip:** Keep this fast and confident. You are signaling engineering depth to the judges without drowning them in detail.

---

### 1:50 - 2:00  Close and Codex credit

**On screen:** Back to a clean dashboard or a simple end card with the project name.

**Voiceover:**
"That's the AI Work Operating System. One brain across all your tools. And honestly, we couldn't have designed or shipped this in a hackathon without Codex. It helped us architect it, catch our mistakes, and move fast. Thanks for watching."

---

## Things to mention out loud (checklist)

Make sure at least these land somewhere in the two minutes:
- One AI across multiple work apps (Jira, Notion, ClickUp).
- Plain-English requests, the AI chooses the tools itself.
- It can chain apps in a single request (Notion to Jira is the star).
- It does real writes, not just reads, and you can verify at the source.
- Security: OAuth, encrypted tokens, the model never sees credentials, destructive actions blocked.
- Built on a real work-graph data model, designed to scale.
- Codex credit at the end.

## Things you do NOT need to say

Keep these out so you don't run over time or undersell:
- Do not walk through the login or OAuth flow live. Have it done already.
- Do not read the endpoint names or code out loud.
- Do not mention the cron / background-jobs system as "not built." In a 2-minute demo, only show what works. Save the roadmap for the written submission and the Q&A.

## Backup plan if the AI misbehaves on camera

Live models are unpredictable. Protect yourself:
- Record each demo prompt 2 or 3 times and keep the best take.
- Have a screen recording of a known-good run saved as a fallback you can cut in.
- Keep prompts short and specific. The more specific the ask, the more reliable the result.
- If a run is slow, you can speed that clip up slightly in editing rather than sitting in silence.

## Suggested prep before recording

1. Log in, connect Jira, Notion, and ClickUp ahead of time. Confirm all show active.
2. Create the "Q3 Roadmap" Notion page with 3 to 4 clear initiatives.
3. Make sure the target Jira project exists and you know its key.
4. Dry-run every prompt once so you know the exact wording that works.
5. Close notifications, extra tabs, and anything with personal data on screen.
