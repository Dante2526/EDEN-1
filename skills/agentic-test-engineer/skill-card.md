## Description:

Drafts test cases, test code, selector fixes, flaky-test diagnoses, and coverage guidance for human review without running tests or changing repositories.

This skill is ready for commercial/non-commercial use.

## Publisher:

[gechengling](https://clawhub.ai/user/gechengling)

### License/Terms of Use:

MIT-0

## Use Case:

QA engineers and developers use this advisory skill to design unit, integration, API, and browser tests, diagnose flaky failures, propose selector repairs, and prioritize coverage gaps. They review its suggestions before running tests or merging changes.

### Deployment Geography for Use:

Global

## Known Risks and Mitigations:

Risk: Screenshots, DOM snapshots, CI logs, and coverage files may expose sensitive information when shared with external testing services.

Mitigation: Use synthetic test data, redact sensitive content, limit snapshots to what is needed, and keep visual testing self-hosted unless vendor handling is approved.

Risk: A suggested selector repair may hide a product regression or target the wrong element.

Mitigation: Review every repair before merging; stop and escalate ambiguous selectors or behavior changes instead of automatically healing them.

## Reference(s):

- [Agentic Test Engineer on ClawHub](https://clawhub.ai/gechengling/skills/agentic-test-engineer)

## Skill Output:

**Output Type(s):** [Code, Analysis, Configuration instructions, Guidance]

**Output Format:** [Markdown with code blocks and tables]

**Output Parameters:** [1D]

**Other Properties Related to Output:** [Advisory output for human review; does not run tests, modify repositories, or access CI.]

## Skill Version(s):

1.0.2 (source: release metadata and frontmatter)

## Ethical Considerations:

Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment.
