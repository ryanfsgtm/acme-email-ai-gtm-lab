# Instructor appendix: complete prompt ledger

> This is the user-authored prompt history that produced the ACME Email AI in GTM lab. It was mined from the originating Codex session and ordered chronologically. Wording, capitalization, shorthand, and typos are intentionally preserved. Environment metadata was omitted, local PDF paths were generalized, and the temporary Attio key was redacted.

**Captured messages:** 56  
**Period:** August 7–9, 2026  
**What is included:** strategy prompts, terse approvals, check-ins, corrections, deployment requests, and curriculum refinements.
**Not included:** assistant replies, tool output, system instructions, and environment metadata.

## 1. Choosing the exercise

### Prompt 1 · Aug 7, 5:11 AM

> i'm teaching a course in Pavilion's AI in GTM school. the title and description: "Session #4
> AI Development Environments: Codex, Cursor, & Beyond
>
> Led by Ryan Iyengar, CEO at Full Stack GTM, Sales, Marketing, and Data Consulting
>
> By the end of this class, you will be able to:
>
> Navigate the AI dev-tool landscape and evaluate new tools systematically
> Understand when to use different development environments
> Build a tool-evaluation rubric your team can reuse"
>
> i've generated this deck as my quick 10-15 minute intro, then i want to spend ~45 minutes in a live coding demo where folks can follow along in their own coding agents. [local course guide PDF] [local session deck PDF]
>
> here are 2 PDFs, my current brief overview on what a coding agent even is in terms of computers, and how to think about when/where to use them. i've also uploaded the course guide for reference.
>
> my main task today is i want to iterate on a git repo that students can clone to get them started in a nice sandbox vs. blank page problem. my first instinct is my movie "watch tonight" repo as its a simple deployed app that we can add live features to. would like to brainstorm other things that might be more specifically "AI in GTM" relevant, but operating around a fake CRM or content hub might be more vague for people. let's plan this out

### Prompt 2 · Aug 7, 5:19 AM

> okay great. i don't love "signal desk". but the general idea of making this a real CRM exercise is a good one. here's an idea - what if we spin up one of these open source CRMs. https://github.com/trycompai/crm or https://twenty.com/ - we can spin up a populated CRM with real data, then maybe add all the class participants to it? oh - but then if they all make changes they'll step all over each other. hmm

### Prompt 3 · Aug 7, 5:24 AM

> the coding agent exercise should be about how to reliably parse larger amounts of information. let's go with Twenty, and seed it with not just a handful, but a LARGE amount of accounts / contacts, and even call transcripts. then let's showcase the classic model of the simple agent prompt "summarize these call transcripts" not really working well, but "build a system to summarize these call transcripts" works great

### Prompt 4 · Aug 7, 5:31 AM

> i like all of this - but don't bother separating the call corpus into sample/workshop/full, just operate on the full. the same lesson structure can be applied against the full set.
>
> let's define our fictional company as ACME Email, a marketing automation platform similar to Marketo. they have SMB, mid market, and enterprise accounts, and yes let's go through the process of the "world model" seeding certain rare but known important hidden gems of findings so that we can uncover them

### Prompt 5 · Aug 7, 5:36 AM

> yes do all of that. let's create a new folder + private repo (that we'll eventually flip to public to share with the class as our starter seed) to do this work in. base it on twenty CRM so we can get a logged in experience, but our primary ask for the class will be to interact via coding agent and CLI, not UI

### Prompt 6 · Aug 7, 5:42 AM

> yes do the hidden private instructor repo. as for model provider, use a deterministic loop around codex agents using luna low, should be sufficient and token efficient

## 2. Building the corpus

### Prompt 7 · Aug 7, 6:12 AM

> check in

### Prompt 8 · Aug 7, 6:59 AM

> check in

### Prompt 9 · Aug 7, 8:04 AM

> check in

### Prompt 10 · Aug 7, 3:55 PM

> check in

### Prompt 11 · Aug 8, 3:31 AM

> check in

### Prompt 12 · Aug 8, 3:34 AM

> yes do that

## 3. Making the CRM real

### Prompt 13 · Aug 8, 4:05 AM

> great. so lets architect the set of instructions and how to onboard the class. im thinking of sharing a promp that says "install this repo and open readme.html in a browser" and then the readme HTML be the shared syllabus? or we can host the HTML if we want class interactivity actually

### Prompt 14 · Aug 8, 4:09 AM

> i like most of this. the one complaint i have is skipping the locally hosted twenty CRM install. is there a lighter weight open CRM we can use? i do want their prompts to "feel" like real ones, with some form of API key or coding agent interaction with CRM, not just "heres accounts and calls in a repo / folder" which is skipping some of the real feel of connecting to live systems

### Prompt 15 · Aug 8, 4:12 AM

> what about a hosted one? is it reasonable to just ask everyone: hey go sign up for Attio or some thing like that, then we all grab our Attio API keys and use them

### Prompt 16 · Aug 8, 4:19 AM

> no pocketbase fallback. let's stick with the Attio example, and architect our repo to be the seed files that will be uploaded to Attio as an example. let's try using this test API key to see if it works [REDACTED TEMPORARY API KEY]

### Prompt 17 · Aug 8, 4:19 AM

> it has records, objects, and notes permissions

### Prompt 18 · Aug 8, 4:37 AM

> great. added user scope to the key. run the importer

### Prompt 19 · Aug 8, 4:48 AM

> is there a better bulk uploader? seems like this is taking a while

### Prompt 20 · Aug 8, 4:56 AM

> okay so is the repo set up with instructions based on what got us to success here? so a student could download the repo, sign up for Attio, share an API key, and get a seeded CRM?

### Prompt 21 · Aug 8, 4:56 AM

> do all of that update and commit and PR

## 4. Building the classroom experience

### Prompt 22 · Aug 8, 5:10 AM

> great. so we're a student, we've updated our Attio instance. now let's build out the shared instructor / student hosted cloudflare page to help guide us through the process. 3 things i'm looking for:
> 1) start of class survey feedback to get live understanding of where people are at in terms of familiarity with coding agents like claude code, codex, cursor. our expectation is to find mostly unfamiliar folks, and cater our content to walking them through step by step how to prompt a coding agent to get superior results to a simple browser experience. live updating page showing survey results as they come in is a nice touch
> 2) guided prompting with simple copy / paste to step through the sections above, starting with repo and attio seed install, and progressing through the analysis prompts
> 3) final survey feedback capture, how familiar are you now, did you increase / stay the same / decrease in confidence type stuff

### Prompt 23 · Aug 8, 5:32 AM

> a bit too much AI slop in the design here. refer to the anti AI slop guides on https://impeccable.style/ and re iterate on the design
>
> also - can we host this page on fullstackgtm.com/ai-in-gtm-class URL? a bit more professional looking than a workers.dev URL
>
> also - instructor dashboard shouldn't be on the same page with a new tab. should be a different URL that only i know (also on fullstackgtm.com for simplicity

### Prompt 24 · Aug 8, 5:47 AM

> the student page should be gated more like a slide deck, and progress through the tasks one full page at a time. start with the "Where are you starting?" survey page. then the Attio setup page, etc. each page/prompt should also have a check / X set of buttons to share "did this work for you?" so we can get a live feedback on if the class is generally keeping pace or not. i don't expect 100% completion given various setups, but i'm hoping to get to 80%+

### Prompt 25 · Aug 8, 5:56 AM

> remove the "Did this work for you?" on the starting survey page. the live pace check on the instructor page doesn't seem to visualize the actual %, it shows 50% but the bar is solid grey.

### Prompt 26 · Aug 8, 6:01 AM

> remove Did this work for you? from the final page too

### Prompt 27 · Aug 8, 6:02 AM

> give me a "clear all data" with confirmation on the instructor page so i can wipe it before class start but keep testing

### Prompt 28 · Aug 8, 6:13 AM

> remove the small text headers on every page: 1 / Starting point
>
> on the top bar "Stage 1 of 7 · Starting survey" add clickable targets for each page so the student can navigate around per page

### Prompt 29 · Aug 8, 6:17 AM

> improve the survey styling on the start / end pages. it's too spaced out and not aligned enough, and should fit on one desktop page, not require scroll

### Prompt 30 · Aug 8, 6:22 AM

> show the same aggregates on room end to students that we do at the start

### Prompt 31 · Aug 8, 6:26 AM

> what are the options on "Most valuable part" from? they should be linked to the steps in the class

### Prompt 32 · Aug 8, 6:31 AM

> add a setup step before the current "Attio" step that is the actual Attio step - i.e. links to go sign up, instructions on how to generate an API key and where to store it

### Prompt 33 · Aug 8, 6:38 AM

> why did the top nav go away - regression

### Prompt 34 · Aug 8, 6:43 AM

> the top page nav is not working

### Prompt 35 · Aug 8, 6:57 AM

> remove "Enable the
> Deals
> standard object if Attio asks which third object to use."
>
> this should be one line: "Generate a workspace API key
> Open the menu beside your workspace name →
> Workspace settings
> →
> Developers
> →
> New access token
> . Name it ACME Email workshop."
>
> this formatting is broken: "Set
> Objects
> to read,
> Records
> to read/write,
> Notes
> to read/write, and
> Users / User management
> to read."
>
> remove the instruction: "Do not paste it into your coding-agent prompt, class chat, or Git." this is a temporary CRM workspace and a temporary class there's no risk to this key leaking

### Prompt 36 · Aug 8, 7:00 AM

> remove all the upper right helper text: "Before the repository", "Intentionally naive", etc.

### Prompt 37 · Aug 8, 7:01 AM

> set everything here to read/write: "Set Objects to read, Records to read/write, Notes to read/write, and Users / User management to read.", should simplify the statement: "set objects, records, ntoes, users to read/write"

## 5. Clean-room installation and release

### Prompt 38 · Aug 8, 7:05 AM

> great. we now have an attio key, let's try to set up a blank container on cloudflare with nothing installed to get a sense of the install hurdles to run our 1st setup prompt, the one that starts "Help me set up the ACME Email AI in GTM lab from this repository:
> https://github.com/ryanfsgtm/acme-email-ai-gtm-lab"

### Prompt 39 · Aug 8, 7:16 AM

> commit and pr and merge the repo then yes flip it to public and re run the test

### Prompt 40 · Aug 8, 7:32 AM

> update readme. and then re run on a more laptop sized container to test runtime.

### Prompt 41 · Aug 8, 7:39 AM

> just use the existing key to clear out our test workspace. then run e2e again

### Prompt 42 · Aug 8, 8:17 AM

> is there a better bulk delete endpoint? this is taking a while

### Prompt 43 · Aug 8, 8:34 AM

> commit and PR with those updates to our repo and execution instructions so students have a clean time installing.

### Prompt 44 · Aug 8, 8:39 AM

> merge

## 6. Testing the thesis

### Prompt 45 · Aug 8, 2:13 PM

> run through the full course as if you were a student in the cloudflare fresh container setup, figure out if our core thesis holds - on this sample CRM, simple summarization prompts with codex provide surface level insights, asking for a deterministic system generates deeper insights. output HTML artifacts along the way and save them here locally throughout the process so we can check on the system.

### Prompt 46 · Aug 8, 6:19 PM

> lets improve on the build a system prompt unyil it reliably returns the deterministc loop of codex subagents we want

### Prompt 47 · Aug 8, 8:04 PM

> while this is working - we need these as well before class: 3-4 Discussion prompts - Due one week before class
> 2-3 Exam questions/answers (multiple choice and/or true-false questions, remember to indicate which answer is correct) - Due one week before class
>
> let's brainstorm some

## 7. Right-sizing the live exercise

### Prompt 48 · Aug 9, 3:29 AM

> how can we slice off the prompt to make it class exercise sized? keep most of the updated prompt language but instruct to run the first 100 calls as a test batch?

### Prompt 49 · Aug 9, 3:30 AM

> commit and pr and merge to repo

### Prompt 50 · Aug 9, 3:32 AM

> update the readme and the class html worker page as well with the latest

### Prompt 51 · Aug 9, 3:46 AM

> some folks may run through this class in codex, some in claude code, some in cursor. add some variants to the prompt with better specifications for models and subagents to use, and put buttons under the main prompt section to let them tyoggle between prompt versions for their harness

### Prompt 52 · Aug 9, 3:55 AM

> weve now kind of skipped a step. we should have a step before build called prompt that helps generate that long specific build prompt. look to our own traces here to find the right example prompt that would generate that build prompt, and add as an explicit class step

### Prompt 53 · Aug 9, 4:04 AM

> update readme

### Prompt 54 · Aug 9, 4:07 AM

> way too long a build prompt. we want it to be something a person realistically would type

### Prompt 55 · Aug 9, 4:07 AM

> way too long a prompt in the prompt generation step. we want it to be something a person realistically would type

### Prompt 56 · Aug 9, 4:27 AM

> as a bonus student / instructor pack - would it be possible to mine our traces here for every prompt we've submitted to build this whole system? might be a fun appendix

## How to use this ledger

Read it as a record of progressive specification. Early prompts establish the business problem. Middle prompts make the environment real and observable. Later prompts are dominated by testing, scope control, regression correction, and teaching design. The short corrections are part of the method: they show that steering an agent is iterative and often conversational.

For a shorter teaching narrative, see [The prompt journey](PROMPT-JOURNEY.md).

