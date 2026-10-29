---
name: "Agentic Test Engineer"
description: "AI-powered autonomous test generation and self-healing test maintenance. Generates unit/integration/E2E tests, detects flaky tests, auto-fixes broken selectors, and maintains test coverage. Built for QA engineers and developers. Keywords: AI test automation, self-healing tests, autonomous QA, test generation, Playwright, Selenium, CI/CD testing, flaky test detection, visual AI testing, test coverage, AI-native QA."
version: "1.0.2"
---

# Agentic Test Engineer

## Overview

An AI-powered autonomous testing assistant that revolutionizes QA workflows. It generates comprehensive test suites from user stories and code, self-heals broken selectors using visual AI, detects and diagnoses flaky tests, and continuously maintains test coverage metrics. It is an **advisory** skill: it
produces test code, selectors, diagnoses and configuration for you to review and run
in your own CI. It does not execute tests, does not edit your repository, and does not
push changes. Every healing suggestion carries a human checkpoint before merge.

## Scope and Data-Handling Policy (read first)

**Advisory only.** This skill drafts tests, selectors and diagnoses. It does not run
them, does not write files into your repository, and does not talk to your CI. Code
blocks below are reference material to copy into your own environment.

**In scope**: unit / integration / E2E / API test design, flaky-test diagnosis,
selector maintenance, coverage triage, and the review policy for AI-generated tests.

**Out of scope (do not activate for these)**: production incident response, security
penetration testing, performance/load engineering, accessibility conformance audits,
and general debugging that is not about a test. Those need their own tooling.

### Third-party and SaaS test-vendor checklist (SQP-2)

Self-healing and visual-regression features are frequently delivered as a SaaS
service. That means **screenshots, DOM snapshots and sometimes test data leave your
network**. Confirm the following before enabling any external vendor:

| Question to answer | Why it matters | Deal-breaker |
|---|---|---|
| Are screenshots and DOM snapshots stored outside our network? | Screenshots of a real policy or claim screen are customer data | Regulated data with no on-prem option |
| Where is the data processed and for how long is it retained? | Retention turns a test artefact into a data store | Retention the vendor cannot state in writing |
| Is the healing engine self-hostable? | Self-hosting removes the egress question entirely | No self-host option and no DPA |
| Can we redact before upload? | Redaction is the practical middle ground | No redaction hook and no masking |
| Does the vendor train on our artefacts? | Your UI may contain unreleased business logic | Training on customer data without an opt-out |
| Who can access the artefact store? | Broad vendor-side access is a real exposure | Shared, unlogged access |

**Data minimisation rules for test artefacts**

1. Seed test data with synthetic values; never copy production records into a fixture.
2. Redact account numbers, ID numbers and faces before any upload or baseline image.
3. Keep DOM snapshots as short as the diagnosis needs — a page fragment, not the page.
4. Treat a quarantine queue as production data: same access controls, same retention.
5. If a vendor cannot answer the table above in writing, keep visual testing self-hosted.



## Triggers

- "generate tests for [feature/code]"
- "write unit tests for [function]"
- "self-heal my broken test"
- "find flaky tests in [project]"
- "check test coverage for [module]"
- "run E2E tests for [workflow]"
- "why is my test failing"
- "智能测试生成"
- "自愈测试修复"
- "测试覆盖率分析"

**Non-triggers (explicitly not this skill)**

- "the site is down, help" → production incident response, not test design
- "load-test this endpoint at 10k rps" → performance engineering
- "is this page WCAG compliant" → accessibility audit
- "fix this bug in my code" → general debugging, not a test concern

## Workflow

### Step 1: Detect Context

Identify the testing scenario:
- **Unit tests**: Python, JavaScript, TypeScript, Java, Go functions
- **Integration tests**: API endpoints, database interactions, service meshes
- **E2E tests**: Browser workflows (Playwright, Cypress, Selenium)
- **API tests**: REST/GraphQL endpoints, contract testing
- **Flaky test diagnosis**: Test results history, timing issues, async race conditions
- **Self-healing**: Broken selectors, changed DOM, moved UI elements

### Step 2: Test Generation

For test generation:
1. Analyze code structure, user story, or API spec
2. Select appropriate testing framework:
   - Python: pytest, unittest
   - JavaScript/TypeScript: Jest, Vitest, Playwright, Cypress
   - Java: JUnit, TestNG
   - Go: testing package, testify
3. Generate comprehensive test cases:
   - Happy path scenarios
   - Edge cases and boundary conditions
   - Error handling scenarios
   - Negative test cases
4. Include setup/teardown fixtures
5. Add data-driven test parameters

**Worked micro-example — turning one user story into a case list**

User story: *"As a policyholder, I can upload a claim document up to 10 MB."*

| # | Case | Type | Input | Expected | Why it earns its place | Priority |
|---|---|---|---|---|---|---|
| 1 | Upload a 2 MB PDF | Happy | valid.pdf | Accepted, stored, ID returned | Baseline path | P0 |
| 2 | Upload exactly 10 MB | Boundary | 10mb.pdf | Accepted | Off-by-one at the limit | P1 |
| 3 | Upload 10 MB + 1 byte | Boundary | over.pdf | Rejected with size error | The classic boundary miss | P0 |
| 4 | Upload 0-byte file | Edge | empty.pdf | Rejected, clear message | Empty file often crashes parsers | P2 |
| 5 | Upload .exe renamed .pdf | Negative | fake.pdf | Rejected on content type | Extension-only validation bypass | P0 |
| 6 | Upload while offline | Error | network drop | Retryable error, no data loss | Network path is untested by default | P2 |

Rule of thumb used above: happy path 1, boundaries 2, edge 1, negative 1, error 1.
If a generator returns 20 near-identical cases, it has enumerated values instead of risks.

**Framework selection quick map**

| Stack | Default choice | Add-on | Avoid when |
|---|---|---|---|
| Python | pytest | pytest-cov, pytest-asyncio | You need strict BDD reporting → use behave |
| JS/TS (unit) | Vitest | @vitest/coverage-v8 | Legacy CommonJS with heavy jest mocks |
| JS/TS (E2E) | Playwright | trace viewer | You require real Safari on old iOS |
| Java | JUnit 5 | JaCoCo, AssertJ | You need data-driven Excel specs → TestNG |
| Go | testing | testify, go-cover-treemap | Table-driven cases need rich diffing → gotest.tools |
| API contract | Pact or OpenAPI schema check | Dredd | Provider is third-party and unstable → mock instead |


### Step 3: Self-Healing (When Triggered)

When a test breaks due to UI changes:
1. Capture the failing selector/error message
2. Use visual AI to identify the new element location
3. Generate updated selector using multiple strategies:
   - Text content matching
   - Semantic role/labels
   - Visual proximity to stable elements
   - Shadow DOM traversal
4. Validate the fix across related tests
5. Log the healing action for audit trail

**Worked micro-example — healing a renamed submit button**

```
Broken:   await page.click('.btn-primary.submit')
Symptom:  Timeout 30000ms exceeded, 0 elements matched
DOM now:  <button data-testid="policy-submit" type="submit">提交保单</button>

Candidate selectors, ranked by robustness:
1. page.getByTestId('policy-submit')        <- stable by contract, best
2. page.getByRole('button', { name: '提交保单' })  <- semantic, i18n-aware
3. page.locator('button[type="submit"]')    <- structural, survives class changes
4. page.getByText('提交保单')                <- brittle if copy changes

Chosen: 1 (with 2 as documented fallback)
Audit entry: { healed_at, old_selector, new_selector, confidence: 0.82,
               evidence: "data-testid present, unique in DOM", reviewer: pending }
```

**When NOT to auto-heal (stop and escalate instead)**

| Situation | Why auto-heal is dangerous | Correct action |
|---|---|---|
| Selector resolves to 2+ elements | Silent wrong-element clicks | Fail loudly, ask for a `data-testid` |
| The element is a legal/financial confirmation | Wrong click has real-world cost | Require human-authored selector |
| Failure appears only in production | May be a real defect, not a test problem | File a bug, do not heal |
| Healing rate > 30% of a suite in one sprint | UI is churning; tests are not the problem | Escalate to the design/dev team |
| Selector change accompanies a behaviour change | Test may now assert the wrong outcome | Re-derive assertions from the spec |

Self-healing is a maintenance aid, not a substitute for a selector contract.
If you heal the same selector twice, add a `data-testid` instead.


### Step 4: Flaky Test Detection

1. Collect test execution history from CI/CD
2. Analyze failure patterns:
   - Timing issues (race conditions, async waits)
   - Resource contention (DB connections, file locks)
   - Environment instability
   - Test interdependencies
3. Generate diagnosis report with:
   - Probability of flakiness
   - Root cause analysis
   - Recommended fixes (add explicit waits, mock external calls, etc.)

**Root-cause taxonomy (use this to classify before proposing a fix)**

| Category | Typical symptom | Diagnostic signal | Fix | How to verify the fix | Cheapest first check |
|---|---|---|---|---|---|
| Async race | Passes locally, fails in CI | Failure time clusters at start-up | Explicit waits / `expect.poll` | 50 consecutive green runs | Rerun the single test 10x in CI, not locally |
| Test interdependency | Fails only in certain orders | Passes when run alone | Isolate fixtures, reset DB per test | Run in random order 10× | Run the test alone; if it passes, it is an order problem |
| Shared resource | Fails under parallel load | Fails more as workers increase | Unique ports/DB schemas, no shared state | Rerun at 4× worker count | Halve the worker count and see if the rate drops |
| Time dependence | Fails at month/day boundaries | Fails on specific dates | Inject a clock, freeze time | Run with 5 faked dates | Run with a frozen clock at month-end and leap day |
| External dependency | Fails randomly, no code change | Network errors in logs | Mock or contract-test the boundary | Cut network, still green | Cut the network and see if it still passes |
| Environment drift | Fails only on one runner | Version mismatch in logs | Pin versions, containerise | Compare runner fingerprints | Diff the runner's tool versions against a green runner |
| Data pollution | Fails after other suites ran | Unexpected rows present | Transaction rollback / fresh seed | Run full suite twice in a row | Run the full suite twice back-to-back |

**Severity rule**: a test that flakes more than 1 in 100 runs should be quarantined
within one sprint. Quarantining is not the same as deleting — keep it running in a
non-blocking job so the signal is not lost.


### Step 5: Coverage Analysis

1. Parse code and existing test files
2. Calculate line/branch/function coverage
3. Identify untested code paths
4. Suggest priority test cases for uncovered areas
5. Generate coverage trend report

**Coverage is a triage tool, not a target — prioritise like this**

| Band | Current coverage | Risk profile | What to do first | What to ignore | Gate to set now |
|---|---|---|---|---|---|
| Critical path | 0–40% | Payment, underwriting, auth | Tests + contract tests + alerting | Mutation score | Ratchet from today, never lower; alert on regression |
| Business logic | 40–70% | Pricing, eligibility rules | Property-based tests on rules | Chasing 100% line coverage | Gate on branch coverage, not line coverage |
| Glue / adapters | 70–90% | Controllers, mappers | Integration tests at the boundary | Unit tests per branch | Gate at the boundary, not per branch |
| Generated code | any | DTOs, clients | Exclude from coverage denominators | Manual assertions | Exclude from the denominator entirely |
| Dead code | any | Unreachable | Delete it | Testing it | Delete the code instead of gating it |

**Two coverage metrics that beat line coverage**

1. *Mutation score* — inject small faults; a suite that still passes has blind spots.
2. *Critical-path coverage* — coverage restricted to the modules that carry money or
   regulatory risk. A 60% score here matters more than 95% overall.

**Anti-pattern**: raising the coverage gate while the suite is flaky. You will get
green numbers and no confidence.


## Input/Output Examples

### Example 1: Generate Unit Tests

**Input:**
```
Generate unit tests for this Python function:
def calculate_premium(age: int, health_score: float, coverage_amount: float) -> float:
    if age < 18 or age > 70:
        raise ValueError("Age must be between 18 and 70")
    base_rate = coverage_amount * 0.05
    health_factor = 1.0 - (health_score / 100) * 0.3
    return base_rate * health_factor
```

**Output:**
```python
import pytest
from your_module import calculate_premium

class TestCalculatePremium:
    def test_happy_path(self):
        result = calculate_premium(age=30, health_score=80, coverage_amount=100000)
        assert 3000 <= result <= 5000

    def test_age_boundary_18_valid(self):
        result = calculate_premium(age=18, health_score=50, coverage_amount=100000)
        assert result == 100000 * 0.05 * (1.0 - 0.5 * 0.3)

    def test_age_boundary_70_valid(self):
        result = calculate_premium(age=70, health_score=50, coverage_amount=100000)
        assert isinstance(result, float)

    def test_age_too_young(self):
        with pytest.raises(ValueError, match="Age must be between"):
            calculate_premium(age=17, health_score=80, coverage_amount=100000)

    def test_age_too_old(self):
        with pytest.raises(ValueError, match="Age must be between"):
            calculate_premium(age=71, health_score=80, coverage_amount=100000)

    @pytest.mark.parametrize("health_score,expected_factor_range", [
        (0, (0.97, 1.01)),
        (50, (0.82, 0.88)),
        (100, (0.69, 0.71)),
    ])
    def test_health_factor_bounds(self, health_score, expected_factor_range):
        result = calculate_premium(age=30, health_score=health_score, coverage_amount=100000)
        lower, upper = expected_factor_range
        assert lower * 5000 <= result <= upper * 5000
```

### Example 2: Self-Healing a Broken Playwright Test

**Input:**
```
My Playwright test is failing: Selector ".submit-button" not found.
The button text is "提交保单" now.
```

**Output:**
```
🔧 Self-Healing Analysis:
- Original selector: ".submit-button"
- Issue: UI updated, element selector changed
- Healed selector strategy: text-content match

Generated alternatives:
1. await page.getByRole('button', { name: '提交保单' }).click()
2. await page.locator('button[type="submit"]').click()
3. await page.getByText('提交保单').click()

Recommended (most robust): Option 1
- Uses semantic role binding (survives CSS class changes)
- Language-aware (works with i18n updates)
```

### Example 3: Flaky Test Diagnosis

**Input:**
```
Diagnose why this test is flaky:
it('should load user dashboard', async () => {
  const dashboard = await page.locator('.dashboard').waitFor();
  const count = await dashboard.locator('.card').count();
  expect(count).toBeGreaterThan(0);
});
```

**Output:**
```
Flaky Test Report:
- Flakiness probability: 87% (HIGH)
- Root cause: Race condition between page load and element appearance

Recommended fixes:
1. Replace implicit waitFor() with explicit wait:
   await expect(page.locator('.dashboard')).toBeVisible({ timeout: 10000 })

2. Add network idle wait:
   await page.waitForLoadState('networkidle')

3. Use data-testid for stability:
   <div data-testid="user-dashboard" className="dashboard">...</div>

4. Add retry wrapper for truly async cases:
   await expect.poll(async () => {
     return await page.locator('.card').count();
   }, { timeout: 10000 }).toBeGreaterThan(0);
```

### Example 4: Coverage triage for a legacy module

**Input:**
```
Module: premium_calculator.py, 41% coverage, 1,800 lines, no tests for 2 years.
Where do we start? We cannot stop feature work to fix this.
```

**Output:**
```
Do not "add tests until 80%". Triage instead.

Step 1 - Find the money paths (half a day)
  Grep for the entry points actually called in production:
  calculate_premium, apply_discount, validate_eligibility
  These 3 functions are ~180 lines and carry all the risk.

Step 2 - Characterisation tests first (2 days)
  Before refactoring anything, lock in current behaviour:
  - Snapshot 200 real historical inputs -> outputs into a fixture file
  - Assert the module reproduces them exactly
  This makes future refactoring safe even if today's behaviour is wrong.

Step 3 - Add rule tests only where rules are unclear (3 days)
  Boundary: age 18 / 70, health_score 0 / 100, coverage 0 / max
  Negative: non-integer age, negative coverage, None
  Error: missing rate table -> explicit exception, not silent 0

Step 4 - Exclude the noise (1 hour)
  # .coveragerc
  omit = generated/*, migrations/*, */dto/*

Step 5 - Set the gate where you actually are, then ratchet
  Start the gate at 45% (today + small margin) and raise it only when a
  pull request would otherwise pass below it. Never lower it.

Realistic outcome after 1 sprint: overall ~55%, critical-path ~90%.
The second number is the one that matters.
```

### Example 5: A test that should not be healed

**Input:**
```
This Playwright test has been auto-healed 4 times this month. Should we heal it again?
```

**Output:**
```
No. Four heals in a month is a design signal, not a maintenance event.

What the pattern tells us:
- The UI is churning faster than the test contract can follow
- There is no stable selector agreement between dev and QA
- Each heal silently moves the test further from the original intent
- At some point the test will pass while the feature is broken

Recommended sequence:
1. Freeze healing on this test; mark it @quarantined with an expiry date
2. Ask the dev team to add data-testid to the 3 elements involved
   (a 15-minute change that removes the whole problem class)
3. Re-derive the assertions from the user story, not from the current DOM
4. Add the selector contract to the definition-of-done for that component

Escalation trigger for management:
- If >20% of the suite needed healing this month, the cost is a process problem.
  One engineer adding test IDs is cheaper than an agent healing forever.

Healing budget rule of thumb: at most 2 heals per selector per quarter.
Beyond that, fix the contract.
```

### Example 6: Should we send screenshots to a SaaS visual-testing vendor?

**Input:**
```
Our vendor's visual AI would fix our flaky selectors, but it uploads screenshots.
Legal is uneasy. What do we actually need to decide?
```

**Output:**
```
This is a data-handling decision before it is a tooling decision. Work the list:

1. Classify what is in the screenshot.
   A checkout page with a real name and policy number is personal data. A login
   page with synthetic credentials usually is not. Most suites contain both.

2. Ask the vendor the six questions in the Scope and Data-Handling Policy table,
   and require written answers - not a marketing page.

3. Try the middle path first: redact before upload.
   Mask text nodes containing account or ID patterns, blur faces, and upload
   page fragments rather than full-page captures. Many teams find this is enough.

4. If redaction is insufficient, self-host the comparison.
   Playwright snapshot comparison runs entirely inside your network; you lose
   some convenience and keep the data.

5. Whatever you choose, log it as a control.
   Record which suites are allowed to egress, on what basis, and who approved it.
   "We never thought about it" is the finding an auditor will write down.

Default answer if nobody owns the decision: do not upload. A flaky selector is
an inconvenience; an uncontrolled data egress is not.
```



## Key Capabilities

| Capability | Description | Supported Frameworks | Input you must supply | Output artifact | Main false-positive risk | Human checkpoint |
|---|---|---|---|---|---|---|
| Test Generation | Generate tests from code/user stories | pytest, Jest, Vitest, JUnit, Playwright, Cypress | Source file + user story or API spec | Test file + case table | Assertions mirror a buggy implementation | Review expected values against the spec |
| Self-Healing | Auto-fix broken selectors | Playwright, Cypress, Selenium | Failing selector + DOM snapshot | Ranked candidate selectors + audit entry | Selector matches the wrong element | Approve before merge |
| Flaky Test Detection | Diagnose intermittent failures | All major frameworks + CI logs | ≥ 30 runs of history | Root-cause report + fix list | Blaming flakiness for a real defect | Confirm with a targeted rerun |
| Coverage Analysis | Measure and report test coverage | Istanbul, pytest-cov, JaCoCo | Coverage JSON/XML | Gap list + priority order | High line coverage, low assertion quality | Pair with mutation score |
| API Contract Testing | Validate API schemas and responses | OpenAPI, Postman, Pact | OpenAPI spec or consumer contract | Contract report + breaking-change diff | Spec itself is stale | Re-sync spec from production traffic |
| Mutation Testing (advisory) | Assess assertion strength | mutmut, Stryker, PIT | Passing suite + source | Mutation score per module | Equivalent mutants inflate the score | Sample-review surviving mutants |
| Visual Regression (advisory) | Catch unintended UI change | Playwright snapshots, Percy | Baseline images | Diff images + review queue | Font/AA rendering noise | Approve or reject each diff |

## Ecosystem Status (as of 2026-09-28)

Tooling in AI-assisted QA changes quickly. Verify each item against the
project's official releases before relying on it.

| Area | What to verify | Why it matters here |
|---|---|---|
| Browser automation baseline | Current Playwright / Cypress / Selenium major versions | Selector APIs and auto-waiting behaviour differ by version |
| Visual AI / self-healing vendors | Whether the healing engine is self-hosted or SaaS | SaaS means screenshots leave your network — a blocker for regulated data |
| CI log retention | How long your CI keeps test history | Flakiness detection needs ≥ 30 runs; short retention kills the signal |
| Coverage format stability | JSON/XML schema of your coverage tool | Parser breaks silently on major upgrades |
| AI-generated test review policy | Your org's rule on merging generated tests | Determines the human checkpoint that must exist |

**Recent dynamics (as of 2026-09-28, verify against official sources)**
1. Self-healing and visual-AI testing have become common features rather than
   differentiators, which shifts the buyer question from "does it heal" to
   "can I audit what it healed and why".
2. More teams are treating test-suite health as a production signal: flaky-test
   quarantine budgets and mutation scores are appearing alongside coverage gates.
3. Data-residency concerns are pushing some regulated teams away from
   SaaS-based visual testing toward self-hosted snapshot comparison.
4. Vendor due-diligence for AI test tooling has widened: buyers now routinely ask
   where screenshots and DOM snapshots are processed, how long they are retained,
   and whether they are used for training — not just whether the healing works.
5. Self-hosted snapshot comparison has become a common fallback for teams that
   cannot accept screenshot egress, at the cost of maintaining baselines in-repo.
6. Every version number and tool name above is point-in-time; confirm upstream.

## Best Practices

1. **Always add `data-testid` attributes** to UI elements for stable selectors
2. **Use explicit waits** instead of `sleep()` — AI will recommend optimal wait strategies
3. **Keep tests isolated** — each test should be independent
4. **Parameterize test data** — use data-driven tests for variant coverage
5. **Review self-healed selectors** — AI suggestions should be human-verified before production

## Notes

- This skill produces test code, analysis and configuration for you to run in your own environment; the code blocks in this document are reference material, not commands this skill executes on your behalf
- For CI/CD integration, combine with `ai-test-strategy-architect` skill
- Self-healing suggestions prioritize semantic selectors over CSS class selectors
- Coverage analysis requires access to test execution output files (JSON/XML format)

## Changelog

- **1.0.1** (2026-09-10): Added worked micro-examples to Steps 2–5 (story→case table,
  selector healing with audit entry, flaky root-cause taxonomy, coverage triage bands).
  Added "when NOT to auto-heal" table and coverage-priority table. Expanded the
  capability table from 3 to 7 columns and 5 to 7 rows (input required, output artifact,
  false-positive risk, human checkpoint). Added Examples 4–5. Added "Ecosystem Status
  (as of 2026-09-10)". Clarified the execution-boundary note.
- **1.0.2** (2026-09-28): Replaced the "minimal human intervention" claim with an
  accurate statement that the skill is advisory and does not execute tests or edit
  repositories. Added a "Scope and Data-Handling Policy" section covering the
  advisory boundary, explicit out-of-scope topics and non-triggers (SQP-1), plus a
  six-question SaaS/visual-testing vendor checklist and five data-minimisation rules
  for test artefacts (SQP-2). Added a Priority column to the story-to-case table, a
  "Gate to set now" column to the coverage triage table and a "Cheapest first check"
  column to the flaky root-cause taxonomy. Added Example 6 on screenshot egress
  decisions. Ecosystem status updated to 2026-09-28 with two additional dynamics.

- **1.0.0** (2026-05-19): Initial version.

**Last Updated**: 2026-09-28
