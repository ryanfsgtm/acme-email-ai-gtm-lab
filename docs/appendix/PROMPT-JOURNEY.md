# Student appendix: the prompt journey

The ACME Email lab did not begin with a perfect specification. It began with a broad teaching goal and became reliable through a sequence of ordinary prompts, experiments, failures, and corrections.

This appendix preserves the pivotal prompts. They are shown largely as written—including shorthand—because the point is not polished prose. The point is how the prompts changed the work.

## 1. Start with the learning experience

> my main task today is i want to iterate on a git repo that students can clone to get them started in a nice sandbox vs. blank page problem. my first instinct is my movie "watch tonight" repo as its a simple deployed app that we can add live features to. would like to brainstorm other things that might be more specifically "AI in GTM" relevant

**What it did:** Established the learner constraint before choosing the technology. The exercise needed to be approachable, cloneable, and demonstrable in 45 minutes.

## 2. Make the environment feel real

> the coding agent exercise should be about how to reliably parse larger amounts of information. let's go with Twenty, and seed it with not just a handful, but a LARGE amount of accounts / contacts, and even call transcripts. then let's showcase the classic model of the simple agent prompt "summarize these call transcripts" not really working well, but "build a system to summarize these call transcripts" works great

**What it did:** Defined the central contrast: producing an answer versus building a system that can prove how it produced the answer.

## 3. Build a world with something worth finding

> let's define our fictional company as ACME Email, a marketing automation platform similar to Marketo. they have SMB, mid market, and enterprise accounts, and yes let's go through the process of the "world model" seeding certain rare but known important hidden gems of findings so that we can uncover them

**What it did:** Turned synthetic data into an evaluation environment. Common patterns alone would make nearly any summary look reasonable; rare, known signals let the instructor test whether deeper analysis actually works.

## 4. Choose a repeatable analysis shape

> use a deterministic loop around codex agents using luna low, should be sufficient and token efficient

**What it did:** Introduced the architecture that became the lesson: one capable supervising agent builds the system, while bounded lower-cost workers perform repeatable extraction.

## 5. Reject the folder-of-files shortcut

> i do want their prompts to "feel" like real ones, with some form of API key or coding agent interaction with CRM, not just "heres accounts and calls in a repo / folder" which is skipping some of the real feel of connecting to live systems

**What it did:** Preserved the operational reality of GTM work: authentication, pagination, schemas, hosted records, rate limits, and incomplete assumptions.

## 6. Prefer isolated hosted workspaces

> what about a hosted one? is it reasonable to just ask everyone: hey go sign up for Attio or some thing like that, then we all grab our Attio API keys and use them

**What it did:** Solved the shared-state problem. Every student could operate against a real CRM without overwriting classmates’ work.

## 7. Make onboarding reproducible

> okay so is the repo set up with instructions based on what got us to success here? so a student could download the repo, sign up for Attio, share an API key, and get a seeded CRM?

**What it did:** Converted an instructor’s successful setup into a student-facing installation contract.

## 8. Add live classroom instrumentation

> guided prompting with simple copy / paste to step through the sections above, starting with repo and attio seed install, and progressing through the analysis prompts

> each page/prompt should also have a check / X set of buttons to share "did this work for you?" so we can get a live feedback on if the class is generally keeping pace or not. i don't expect 100% completion given various setups, but i'm hoping to get to 80%+

**What it did:** Made the class observable. The instructor could distinguish a good explanation from a room that was actually keeping up.

## 9. Test setup as a student would experience it

> let's try to set up a blank container on cloudflare with nothing installed to get a sense of the install hurdles to run our 1st setup prompt

**What it did:** Replaced “the README looks complete” with an installation test in a clean environment.

## 10. Test the teaching thesis, not only the software

> run through the full course as if you were a student in the cloudflare fresh container setup, figure out if our core thesis holds - on this sample CRM, simple summarization prompts with codex provide surface level insights, asking for a deterministic system generates deeper insights. output HTML artifacts along the way and save them here locally throughout the process so we can check on the system.

**What it did:** Defined an end-to-end educational evaluation. Success meant demonstrating a meaningful difference between the two approaches, not merely producing working code.

## 11. Improve the prompt through real failures

> lets improve on the build a system prompt unyil it reliably returns the deterministc loop of codex subagents we want

**What it did:** Started the cleanroom iteration loop. Each failure became a more precise contract: correct Attio endpoints, plaintext parsing, optional speaker roles, supported schema keywords, stable evidence IDs, deterministic CRM joins, bounded concurrency, and no-op resume.

## 12. Right-size the live exercise

> how can we slice off the prompt to make it class exercise sized? keep most of the updated prompt language but instruct to run the first 100 calls as a test batch?

**What it did:** Separated full-source inventory from classroom analysis scope. Students still prove access to all 2,500 calls, but run only five 20-call batches during class.

## 13. Support the harness students already use

> some folks may run through this class in codex, some in claude code, some in cursor. add some variants to the prompt with better specifications for models and subagents to use

**What it did:** Preserved one analysis contract while adapting subprocess commands, model selection, output envelopes, permissions, and schema validation to each harness.

## 14. Teach how the long prompt gets made

> we should have a step before build called prompt that helps generate that long specific build prompt. look to our own traces here to find the right example prompt that would generate that build prompt

**What it did:** Restored the missing reasoning step between auditing a weak answer and receiving a detailed implementation specification.

## 15. Keep the human prompt human-sized

> way too long a prompt in the prompt generation step. we want it to be something a person realistically would type

**What it did:** Clarified the lesson. A person supplies goals and constraints; the coding agent investigates the repository, CRM, and harness and authors the detailed specification.

## What the sequence teaches

The improvement did not primarily come from finding more impressive words. It came from changing the unit of work:

1. Define the business decision and the environment.
2. Ask for an initial answer.
3. Audit what that answer cannot prove.
4. Ask the agent to inspect the real system and design an executable specification.
5. Build bounded, observable, resumable machinery.
6. Validate evidence and computed claims independently.
7. Reduce scope without weakening the architecture.

The complete chronological record—including terse approvals, check-ins, UI corrections, and operational prompts—is available in [the instructor prompt ledger](INSTRUCTOR-PROMPT-LEDGER.md).
