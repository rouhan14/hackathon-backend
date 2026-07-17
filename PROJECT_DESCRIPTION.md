# AI Work Operating System

## Overview
The AI Work Operating System is an intelligent layer that connects all workplace tools into a single, context-aware assistant. Instead of switching between multiple applications, users interact with one AI that understands their work, priorities, and ongoing projects.

## Integrations
The system can integrate with:
- Microsoft Teams
- Slack
- Jira
- ClickUp
- Gmail
- Outlook
- Notion
- Google/Outlook Calendar
- Fireflies.ai

## How It Works
The AI continuously collects and processes context from connected platforms, including:
- Messages and conversations
- Tasks and tickets
- Emails
- Meeting transcripts
- Documents and notes
- Calendar events
- Development activity

By combining this information, it creates a unified understanding of the user's work and the organization's workflow.

## Features
- Prioritize tasks based on urgency and dependencies.
- Generate personalized daily work summaries.
- Suggest context-aware replies before sending messages or emails.
- Track blockers, follow-ups, and pending actions.
- Extract action items and decisions from meetings.
- Answer questions using organization-wide context.
- Provide proactive recommendations on what to work on next.

## Vision
Build a single AI assistant that understands the complete workplace context, enabling teams to work more efficiently, communicate smarter, and focus on the right priorities without constantly switching between tools.

## MCP Integration Ownership

We will begin with the platforms that offer official MCP servers. Each owner will research the provider's MCP capabilities, complete the OAuth/administrator setup, document required permissions and rate limits, and create a short integration handoff. Google and Microsoft products are grouped because they share a single cloud/tenant identity setup.

| Teammate | Platforms | Relative effort | How the MCP integration would work |
|---|---|---|---|
| Rouhan | Slack; Notion; Fireflies.ai | Medium | Register/configure the provider connection, authenticate each user with OAuth, and connect its remote MCP endpoint to our AI-agent layer. Start with read/search tools for messages, workspace pages, and meeting transcripts; require user confirmation before any write action. |
| Ahmad | Jira (Atlassian Rovo); ClickUp; Google Workspace (Gmail and Google Calendar) | Medium | Add Atlassian Rovo and ClickUp as remote OAuth MCP servers. For Google, create a Google Cloud project, enable the Gmail and Calendar MCP services/APIs, configure OAuth consent/scopes, then connect their remote endpoints. Begin with task/email/calendar search and summaries. |
| Abdullah | Microsoft Teams; Outlook Mail; Outlook Calendar | Medium | Configure Microsoft Entra application registration and delegated permissions, then connect the Microsoft 365/Agent 365 MCP servers through OAuth. Start with read-only Teams, mail, and calendar tools; document any preview-program or tenant-admin requirements before enabling actions. |

### Common Integration Flow

1. Confirm the user or organization has an eligible account/plan and administrator approval where required.
2. Create an OAuth application and request only the minimum scopes needed.
3. Add the provider's remote MCP endpoint to the AI-agent layer and complete the OAuth authorization flow.
4. Test read-only tools first (search, list, retrieve), record rate limits and errors, and map returned data to our common workplace-context model.
5. Add write tools later with explicit user confirmation, audit logging, and least-privilege permissions.

### Notes

- Google Workspace MCP servers are currently in Developer Preview.
- Microsoft Teams, Outlook Mail, and Outlook Calendar MCP servers are currently part of Microsoft Agent 365/Frontier preview, so Abdullah's first deliverable is to verify tenant access and fallback options.
- MCP will accelerate AI actions, but our eventual production backend may still use provider APIs/webhooks for durable background synchronization.
