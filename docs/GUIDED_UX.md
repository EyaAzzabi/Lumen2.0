# Guided workspace UX

The main map now uses three steps (Prepare, Analyze, Coordinate), one contextual panel and a small map toolbar. Search, overlapping quick actions, carousel, duplicated view switches and the automatic sample mission were removed from the main flow. Advanced registry, reports and model documentation remain under More tools.

A mission starts with an empty name and no assessment. Parameters and touchdown coordinates drive the existing backend. Comparison previews fetch assessment and footprint together and do not mutate the working site until adoption. Outdated preview responses are ignored. The contextual copilot distinguishes local guidance / offline templates from model-generated briefs.

Coordination files real proposals and uses actual scoped consultations, responses and revision history. Drafts are in memory until filed; terrain and infrastructure remain synthetic. This is a simplified model, not flight certification.

Validation: production build; Playwright journey covering configuration, assessment, optimization, preview, adoption, proposal persistence and mobile width; network failure and successful retry; Eya auth signup, organization invite, session and logout flow. Tests use backend/serve_test.py with temporary SQLite, never the user's registry. Older browser scenarios targeting the removed dashboard controls need migration and are not included in this focused run.
