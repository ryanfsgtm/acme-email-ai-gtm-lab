# ACME Email AI in GTM Lab

A synthetic CRM and call-transcript corpus for ACME Email, a fictional marketing-automation company. It's for learning how coding agents analyze more information than fits in one context window.

The class exercise: students give Claude Code one prompt, and it builds a system that reads 200 calls with Sonnet subagents, stores the results in SQLite, and publishes the findings as a Claude artifact.

## Class quick start: build it from a prompt

The artifact has three levels: a summary of sentiment and product insights, a drill-down into each segment to see the calls behind it, and each call's analysis with the relevant transcript sections highlighted. [See one finished version](https://claude.ai/artifact/9E7D3hEYtWLeTHu29WzZJf). The class walkthrough is at [fullstackgtm.com/ai-in-gtm-class](https://fullstackgtm.com/ai-in-gtm-class).

You need:

- [Claude Code](https://code.claude.com/docs/en/setup), signed in with a Claude Pro, Max or Team plan
- [Node.js](https://nodejs.org) 22.13 or newer (`node --version` to check)
- Git, or the [ZIP download](https://github.com/ryanfsgtm/acme-email-ai-gtm-lab/archive/refs/heads/main.zip)

Then:

```bash
git clone https://github.com/ryanfsgtm/acme-email-ai-gtm-lab.git
cd acme-email-ai-gtm-lab
claude
```

Choose **Yes** when Claude Code asks whether you trust the folder, then paste this prompt:

```text
I want a Claude artifact built from the ACME Email call transcripts in this repo that shows:
1) a summary of all the calls with sentiment and product insights extracted
2) a drill-down into each segment to see which calls contributed
3) a final drill-down with the per-call analysis and the relevant sections of the transcript highlighted

To do this, build a system that uses Claude Sonnet subagents to process the calls and stores the segmented results in a SQLite database. Use only the 200 calls listed in data/class-slice.txt. The transcripts are in data/generated/transcripts, and the account, opportunity and call metadata is in data/generated.

Build all of this out, then publish the page as an artifact. Match the style of https://fullstackgtm.com/ai-in-gtm-class, and use https://impeccable.style/slop/ to remove slop.
```

`data/class-slice.txt` lists the 200 calls: a sample in proportion to call type and customer segment, the same for everyone in the class.

The `reference-solution` branch has one finished version of the system, with a `/analyze-calls` command that builds the same kind of page. Look at it after you've built your own.

## What's in the data

Everything is synthetic. ACME Email and its customers are fictional.

- `data/class-slice.txt`: the 200 call IDs, one per line.
- `data/generated/transcripts/`: one transcript file per call.
- `data/generated/accounts.jsonl`, `contacts.jsonl` and `opportunities.jsonl`: the accounts, people and deals behind each call.
- `data/generated/manifest.jsonl`: the metadata for each call (type, date, account, opportunity).

The repo holds 2,500 calls in all. The class uses only the 200 in the list.
