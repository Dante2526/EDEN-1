# Graph Report - .  (2026-10-17)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2760 nodes · 5088 edges · 187 communities (145 shown, 42 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 123 edges (avg confidence: 0.63)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b6b56d69`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- _security.ts
- aminer_client.py
- App.tsx
- QuizMasteryService
- index.ts
- fetch_volunteers.py
- toc_validate.py
- github.ts
- design_system.py
- preview-html.ts
- html2pptx1.js
- studio-panel.tsx
- .error
- pdf_qa.py
- types.ts
- compilerOptions
- ConsistencyChecker
- xlsx.py
- scripts
- TimelineTracker
- poster_validate.py
- graphify-engine.ts
- run_loop
- pdf.py
- DeckStage
- postcheck.py
- Document
- aminer_api.py
- package.json
- run_pipeline
- compilerOptions
- XMLEditor
- DocxXMLEditor
- subagent-runner.ts
- generate_review.py
- handle_trigger.py
- generate_html.py
- compilerOptions
- run_main
- base.py
- deployment-service.ts
- BaseSchemaValidator
- chat-message.tsx
- add_toc_placeholders.py
- generate.ts
- package.json
- palettes.py
- ._setup_tracking
- convert_latex
- parse_file
- settings-modal.tsx
- dependencies
- compilerOptions
- DOCXSchemaValidator
- PPTXSchemaValidator
- GlobalErrorBoundary
- compilerOptions
- RedliningValidator
- ._validate_single_file_xsd
- migrate-theme.mjs
- .__init__
- StreamingSpeechQueue
- paper_set.py
- style_kit.py
- html2pdf-next.js
- batch_html2pptx.js
- check_slides.py
- design_engine.py
- compile_blueprint
- form_annotate
- aggregate_benchmark.py
- speech.ts
- document-generator.ts
- manifest.json
- PaperSetTests
- generate_cascade_palette
- form_fill_legacy
- voice-button.tsx
- jd_gap.py
- generate_generative_svg
- build_quiz_html.py
- main
- mcp-client.ts
- wake-lock.ts
- apply-dss-theme.mjs
- generate_color_palette
- package_skill
- package.json
- test-cf-splitter.ts
- star_story_builder.py
- _gather_fields
- copy-cf-artifacts.mjs
- neutralize-dark.mjs
- main
- _auto_assign_grid_areas
- pack_document
- extract_pptx_style.py
- list_examples
- parse_jd.py
- generate_visual
- cover_validate.js
- html2poster.js
- video.ts
- style_total_row
- SelectedPreviewElement
- generate-favicons.mjs
- setup.sh
- setup.sh
- setup_mac_linux.sh
- generate_flow_svg
- _best_font_for_char
- content_sanitize
- setup.sh
- unpack_document
- fetch-rendered-dom.mjs
- setup.sh
- _apply
- generate-png-icons.mjs
- main
- check_missing_glyphs
- setup_sheet
- style_data_row
- vercel.json
- magazine-bg-webgl.js
- magazine-bg-webgl.js
- ._add_author_to_people
- calculate_layout
- package.json
- make_chart_title
- safe-thinking-orb.tsx
- html-extractor.ts
- @stackblitz/sdk
- example.py
- lunar_python.py
- env_check.sh
- extract_html_style.py
- generate_html.py
- project_root
- index.js
- web-reader.ts
- web_search.ts
- scan-bundle.sh
- sound.ts
- clsx
- @codesandbox/sandpack-react
- docx
- dotenv
- exceljs
- idb-keyval
- jspdf
- jspdf-autotable
- motion
- pptxgenjs
- express
- react-dom
- react-markdown
- tailwind-merge
- tsx
- vite
- @vitejs/plugin-react
- sw.js
- __init__.py
- compile.sh
- search.sh
- apply_chart_colors
- apply_pie_colors
- copy_style
- create_pie_chart
- font_caption
- _resolve_font

## God Nodes (most connected - your core abstractions)
1. `AppContent()` - 56 edges
2. `main()` - 39 edges
3. `Document` - 36 edges
4. `_request()` - 31 edges
5. `_track_cost()` - 29 edges
6. `DeckStage` - 29 edges
7. `BaseSchemaValidator` - 25 edges
8. `QuizMasteryService` - 24 edges
9. `checkAuthAndRateLimit()` - 23 edges
10. `compilerOptions` - 23 edges

## Surprising Connections (you probably didn't know these)
- `AppContent()` --indirect_call--> `query()`  [INFERRED]
  src/App.tsx → skills/video-generation/scripts/video.ts
- `generatePowerPoint()` --references--> `pptxgenjs`  [EXTRACTED]
  src/lib/document-generator.ts → package.json
- `AppContent()` --references--> `react`  [EXTRACTED]
  src/App.tsx → package.json
- `ChatImage()` --references--> `react`  [EXTRACTED]
  src/components/chat-message.tsx → package.json
- `lazyWithRetry()` --references--> `react`  [EXTRACTED]
  src/lib/lazy-retry.ts → package.json

## Import Cycles
- 1-file cycle: `skills/get-fortune-analysis/lunar_python.py -> skills/get-fortune-analysis/lunar_python.py`

## Communities (187 total, 42 thin omitted)

### Community 0 - "_security.ts"
Cohesion: 0.06
Nodes (71): CloudflareThinkSplitter, config, handler(), maxTokensFor(), config, handler(), config, extractErrorSnippet() (+63 more)

### Community 1 - "aminer_client.py"
Cohesion: 0.07
Nodes (80): build_parser(), get_cost_summary(), main(), org_detail(), org_disambiguate(), org_disambiguate_pro(), org_paper_relation(), org_patent_relation() (+72 more)

### Community 2 - "App.tsx"
Cohesion: 0.05
Nodes (65): ALL_CHAT_TOOLS, AppContent(), CREATE_PROJECT_TOOL, DEFAULT_CHAT_TOOLS, DISPATCH_SUBAGENT_TOOL, DOCUMENT_GEN_TOOL, FETCH_URL_TOOL, GITHUB_TOOLS (+57 more)

### Community 3 - "QuizMasteryService"
Cohesion: 0.05
Nodes (43): main(), main(), Evaluator, Evaluates user answers against correct answers.      - single_choice / true_fa, MasteryEngine, Update Ebbinghaus spaced repetition schedule.          Correct → advance revie, Return knowledge point IDs that need review.          Criteria:         - nex, Tracks mastery level, weak points, and spaced repetition schedule. (+35 more)

### Community 4 - "index.ts"
Cohesion: 0.06
Nodes (69): analyzeChartImage(), analyzeMultipleStocks(), analyzeStock(), buildDashboardPrompt(), buildReportPrompt(), extractVerdict(), MARKET_LABEL, detectMarket() (+61 more)

### Community 5 - "fetch_volunteers.py"
Cohesion: 0.07
Nodes (58): RuntimeError, cities_to_provinces(), _join_csv(), main(), Any, 返回倾向映射摘要，便于 Agent 向用户说明。, 将 student.json 转为 API 请求体。, student_to_api_payload() (+50 more)

### Community 6 - "toc_validate.py"
Cohesion: 0.08
Nodes (57): check_conversion(), check_docx(), check_pdf(), check_run_hint_style(), check_toc_has_content(), _detect_language(), docx_has_toc_field(), find_toc_field_boundaries() (+49 more)

### Community 7 - "github.ts"
Cohesion: 0.08
Nodes (46): react, react, ChatImage(), SwipeableConversationItem(), CreateRepoModal(), CreateRepoModalProps, FileExplorer(), FileExplorerProps (+38 more)

### Community 8 - "design_system.py"
Cohesion: 0.06
Nodes (42): BM25, detect_domain(), _load_csv(), Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query, Load CSV and return list of dicts, Core search function using BM25 (+34 more)

### Community 9 - "preview-html.ts"
Cohesion: 0.09
Nodes (44): buildTranspiledHtmlSync(), LocalPreview(), LocalPreviewProps, ProjectWorkspace(), ProjectWorkspaceProps, ProjectsPanel(), TEMPLATES, StackBlitzPreviewProps (+36 more)

### Community 10 - "html2pptx1.js"
Cohesion: 0.09
Nodes (47): addBackground(), addElements(), applyEmphasisFont(), calculateWidthCompensation(), checkElementBounds(), checkTextOverlaps(), { chromium }, clampHeightToNextTextBound() (+39 more)

### Community 11 - "studio-panel.tsx"
Cohesion: 0.10
Nodes (34): ChatInput, ChatInputProps, FileAttachmentPreviews(), FileAttachmentPreviewsProps, ModelControls(), ModelControlsProps, extractImagesFromClipboardData(), getClientAuthHeaders() (+26 more)

### Community 12 - ".error"
Cohesion: 0.09
Nodes (42): convert_blueprint(), convert_html(), extract_image(), extract_table(), extract_text(), form_fill(), form_render(), _load_json_arg() (+34 more)

### Community 13 - "pdf_qa.py"
Cohesion: 0.10
Nodes (37): check_blank_pages(), check_body_page_numbers(), check_colors(), check_content_fill_ratio(), check_cover_bleed(), check_font_embedding(), check_formula_overflow(), check_helvetica_in_cjk() (+29 more)

### Community 14 - "types.ts"
Cohesion: 0.09
Nodes (30): ChatSidebar, ChatSidebarProps, ProjectsPanel, DarkModeToggle(), DarkModeToggleProps, DownloaderPanel(), DownloadResult, HistoryItem (+22 more)

### Community 15 - "compilerOptions"
Cohesion: 0.05
Nodes (38): build, lib/**/*, compilerOptions, allowImportingTsExtensions, allowJs, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames (+30 more)

### Community 16 - "ConsistencyChecker"
Cohesion: 0.09
Nodes (20): CharacterProfile, ConsistencyChecker, ConsistencyIssue, main(), Path, Load all character profiles from the project, Check character mentions in content for inconsistencies, Represents a consistency issue found in the story (+12 more)

### Community 17 - "xlsx.py"
Cohesion: 0.08
Nodes (35): auto_fit_columns(), Auto-fit column widths based on DATA content (not header).     Headers that exc, _aggregate(), cell_ref(), _check_charts(), cmd(), cmd_audit(), cmd_chart_verify() (+27 more)

### Community 18 - "scripts"
Cohesion: 0.06
Nodes (34): autoprefixer, esbuild, devDependencies, autoprefixer, esbuild, tailwindcss, @types/express, @types/node (+26 more)

### Community 19 - "TimelineTracker"
Cohesion: 0.09
Nodes (19): main(), Path, Extract character names from explicit character markers, Find mentions of known characters in content, Parse a chapter/scene file for timeline events, Analyze entire project and build timeline, Represents a single event in the story timeline, Group events by their timepoint (+11 more)

### Community 20 - "poster_validate.py"
Cohesion: 0.09
Nodes (27): HTMLParser, _best_generic(), check_html(), check_pdf(), check_tex(), _contrast_ratio(), _extract_color(), _has_generic() (+19 more)

### Community 21 - "graphify-engine.ts"
Cohesion: 0.12
Nodes (26): ColorPalette, getNodePalette(), GraphModal(), GraphModalProps, Camera3DState, compute3DLayout(), deterministicHash(), findClosestProjectedNode() (+18 more)

### Community 22 - "run_loop"
Cohesion: 0.11
Nodes (27): generate_html(), main(), Generate HTML report from loop output data. If auto_refresh is True, adds a meta, _call_zai(), improve_description(), main(), Path, Run `z-ai chat -p` with the prompt and return the text response. (+19 more)

### Community 23 - "pdf.py"
Cohesion: 0.09
Nodes (30): _build_restore_allowlist(), cmd(), code_sanitize(), env_check(), env_fix(), _fallback_symbols(), install_font_fallback(), main() (+22 more)

### Community 25 - "postcheck.py"
Cohesion: 0.14
Nodes (26): check_blank_pages(), check_cover_overflow(), check_font_fallback(), check_heading_levels(), check_image_aspect_ratio(), check_image_overflow(), check_line_spacing(), check_shading_type() (+18 more)

### Community 26 - "Document"
Cohesion: 0.12
Nodes (16): Document, _generate_hex_id(), Add RSID and optionally enable track revisions and update fields in settings.xml, Add a single comment to comments.xml., Add a single comment to commentsExtended.xml., Add a single comment to commentsExtensible.xml., Generate XML for comment range start., Generate XML for comment range end with reference run.          Note: w:rsidR (+8 more)

### Community 27 - "aminer_api.py"
Cohesion: 0.20
Nodes (26): Exception, build_parser(), cmd_info(), cmd_qa_search(), cmd_references(), cmd_search(), _compact_paper(), _dedupe() (+18 more)

### Community 28 - "package.json"
Cohesion: 0.07
Nodes (27): llm, podcast, tts, z-ai, dependencies, z-ai-web-dev-sdk, description, devDependencies (+19 more)

### Community 29 - "run_pipeline"
Cohesion: 0.16
Nodes (23): Any, Path, read_json(), write_json(), build_api_request(), call_rec5_api(), _clean_text(), normalize_rec5_paper() (+15 more)

### Community 30 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+18 more)

### Community 31 - "XMLEditor"
Cohesion: 0.10
Nodes (15): range, _create_line_tracking_parser(), Recursively extract all text content from an element.          Skips text node, Replace a DOM element with new XML content.          Args:             elem:, Insert XML content after a DOM element.          Args:             elem: defu, Insert XML content before a DOM element.          Args:             elem: def, Append XML content as a child of a DOM element.          Args:             el, Get the next available rId for relationships files. (+7 more)

### Community 32 - "DocxXMLEditor"
Cohesion: 0.09
Nodes (14): DocxXMLEditor, Get the next available change ID by checking all tracked change elements., Ensure w16du namespace is declared on the root element., Ensure w16cex namespace is declared on the root element., Ensure w14 namespace is declared on the root element., Inject RSID, author, and date attributes into DOM nodes where applicable., Replace node with automatic attribute injection., Insert before with automatic attribute injection. (+6 more)

### Community 33 - "subagent-runner.ts"
Cohesion: 0.16
Nodes (19): TOOL_MODELS, ALLOWED_MODELS, CLOUDFLARE_MODELS, isCloudflareModel(), isToolCapableModel(), isVisionModel(), TOOL_MODELS, VISION_MODELS (+11 more)

### Community 34 - "generate_review.py"
Cohesion: 0.15
Nodes (19): BaseHTTPRequestHandler, build_run(), embed_file(), find_runs(), _find_runs_recursive(), generate_html(), get_mime_type(), _kill_port() (+11 more)

### Community 35 - "handle_trigger.py"
Cohesion: 0.26
Nodes (23): _capture_field(), _clean_text(), _compact_pipeline_error(), _extract_command_text(), handle_trigger(), _infer_scholar_from_free_text(), _infer_topics_from_free_text(), _load_config() (+15 more)

### Community 36 - "generate_html.py"
Cohesion: 0.16
Nodes (23): aggregate_universities(), build_major_group_entry(), build_rec_maps(), build_school_tags(), build_sections(), collect_probabilities(), compute_stat_pcts(), enrich_context() (+15 more)

### Community 37 - "compilerOptions"
Cohesion: 0.09
Nodes (22): *.ts, compilerOptions, allowSyntheticDefaultImports, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib (+14 more)

### Community 38 - "run_main"
Cohesion: 0.12
Nodes (9): FakeResponse, InfoTests, paper_info_response(), QaSearchTests, Run the CLI with a fake transport; return (exit_code, stdout, stderr)., ReferencesTests, run_main(), SearchTests (+1 more)

### Community 39 - "base.py"
Cohesion: 0.10
Nodes (17): align_header(), border_header(), create_bar_chart(), create_line_chart(), fill_header(), font_header(), get_active_style(), normalize_cell_value() (+9 more)

### Community 40 - "deployment-service.ts"
Cohesion: 0.16
Nodes (17): ChatHeader, ChatHeaderProps, DeploymentErrorCard(), DeploymentErrorCardProps, DeploymentLogModal(), DeploymentLogModalProps, DeploymentStatusBadge(), DeploymentStatusBadgeProps (+9 more)

### Community 41 - "BaseSchemaValidator"
Cohesion: 0.10
Nodes (11): BaseSchemaValidator, Base validator with common validation logic for document files., Validate that all XML files are well-formed., Validate that namespace prefixes in Ignorable attributes are declared., Validate that specific IDs are unique according to OOXML requirements., Validate that all .rels files properly reference files and that all files are re, Validate that all r:id attributes in XML files reference existing IDs         i, Get the expected relationship type for an element.         First checks the exp (+3 more)

### Community 42 - "chat-message.tsx"
Cohesion: 0.15
Nodes (17): ChatMessage, ChatMessageProps, SwipeableConversationItemProps, CodeBlock(), CodeBlockProps, CompactionMarker(), CompactionMarkerProps, buildCompactionPrompt() (+9 more)

### Community 43 - "add_toc_placeholders.py"
Cohesion: 0.16
Nodes (20): add_toc_placeholders(), _detect_toc_styles(), _ensure_hyperlink_style(), _ensure_toc_styles(), _extract_headings_from_docx(), _fix_fld_char_structure(), _fix_heading_outline_levels(), _fix_update_fields() (+12 more)

### Community 44 - "generate.ts"
Cohesion: 0.16
Nodes (20): buildPrompts(), callZAI(), charBudget(), chooseDurationMinutes(), countNonWsChars(), DEFAULT_CONFIG, __dirname, ensureSilenceWav() (+12 more)

### Community 45 - "package.json"
Cohesion: 0.10
Nodes (20): dependencies, z-ai-web-dev-sdk, description, devDependencies, ts-node, @types/node, typescript, @types/node (+12 more)

### Community 46 - "palettes.py"
Cohesion: 0.15
Nodes (19): _Palette, apply_palette(), detect_style(), get_palette(), _infer_from_scene(), list_available(), _make_palette(), _match_style_keywords() (+11 more)

### Community 47 - "._setup_tracking"
Cohesion: 0.11
Nodes (10): Add people.xml relationship to document.xml.rels if not already present., Check if a relationship with given target exists., Check if an override with given part name exists., Ensure word/_rels/document.xml.rels has comment relationships., Ensure [Content_Types].xml has comment content types., Validate the document (lightweight check).          Currently performs basic s, Save all modified XML files to disk and copy to destination directory., Set up comment infrastructure in unpacked directory.          Args: (+2 more)

### Community 48 - "convert_latex"
Cohesion: 0.12
Nodes (18): _classify_lines(), convert_latex(), convert_office(), _find_tectonic(), _human_size(), _locate_soffice(), _parse_writing_note(), _pdf_stats() (+10 more)

### Community 49 - "parse_file"
Cohesion: 0.18
Nodes (15): main(), main(), build_extraction_prompt(), _parse_docx(), parse_file(), _parse_pdf(), _parse_ppt(), _parse_pptx() (+7 more)

### Community 50 - "settings-modal.tsx"
Cohesion: 0.20
Nodes (14): ClaudeLogoProps, EdenBonsaiLogo(), EdenBonsaiLogoProps, SettingsModal(), SettingsModalProps, removeGitHubPat(), setGitHubPat(), verifyGitHubPat() (+6 more)

### Community 51 - "dependencies"
Cohesion: 0.12
Nodes (17): @andresaya/edge-tts, cheerio, cross-env, lucide-react, dependencies, @andresaya/edge-tts, cheerio, cross-env (+9 more)

### Community 52 - "compilerOptions"
Cohesion: 0.12
Nodes (16): ES2020, compilerOptions, esModuleInterop, lib, module, outDir, resolveJsonModule, rootDir (+8 more)

### Community 53 - "DOCXSchemaValidator"
Cohesion: 0.17
Nodes (9): DOCXSchemaValidator, Validator for Word document XML files against XSD schemas., Validate that w:t elements are not within w:del elements.         For some reas, Count the number of paragraphs in the unpacked document., Count the number of paragraphs in the original docx file., Validate that w:delText elements are not within w:ins elements.         w:delTe, Run all validation checks and return True if all pass., Compare paragraph counts between original and new document. (+1 more)

### Community 54 - "PPTXSchemaValidator"
Cohesion: 0.17
Nodes (9): Validation modules for Word document processing., PPTXSchemaValidator, Validator for PowerPoint presentation XML files against XSD schemas., Check if a value has the general structure of a UUID., Validate that sldLayoutId elements in slide masters reference valid slide layout, Validate that each slide has exactly one slideLayout reference., Validate that each notesSlide file is referenced by only one slide., Run all validation checks and return True if all pass. (+1 more)

### Community 55 - "GlobalErrorBoundary"
Cohesion: 0.20
Nodes (6): ErrorBoundaryProps, ErrorBoundaryState, GlobalErrorBoundary, isDynamicChunkError(), lazyWithRetry(), handleChunkError()

### Community 56 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowSyntheticDefaultImports, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+8 more)

### Community 57 - "RedliningValidator"
Cohesion: 0.17
Nodes (8): main(), Validator for tracked changes in Word documents., Generate detailed word-level differences using git word diff., Generate word diff using git with character-level precision., Remove tracked changes authored by Z.AI from the XML root., Main validation method that returns True if valid, False otherwise., Extract text content from Word XML, preserving paragraph structure.          E, RedliningValidator

### Community 58 - "._validate_single_file_xsd"
Cohesion: 0.13
Nodes (8): Run all validation checks and return True if all pass., Validate a single XML file against XSD schema, comparing with original., Validate XML files against XSD schemas, showing only new errors compared to orig, Determine the appropriate schema path for an XML file., Preprocess XML to handle mc:Ignorable attribute properly., Validate a single XML file against XSD schema. Returns (is_valid, errors_set)., Get XSD validation errors from a single file in the original document., Remove template tags from XML text nodes and collect warnings.          Templa

### Community 59 - "migrate-theme.mjs"
Cohesion: 0.20
Nodes (14): BG, dark, FG, hexToRgb(), hslToHex(), light, lightValue(), names (+6 more)

### Community 60 - ".__init__"
Cohesion: 0.15
Nodes (10): _condense_xml(), _generate_rsid(), _pack_document(), Initialize with required RSID and optional author.          Args:, Strip unnecessary whitespace from XML, preserving text content., Generate random 8-character hex RSID., Initialize with path to unpacked Word document directory.         Automatically, Pack an unpacked directory back into a .docx file. (+2 more)

### Community 61 - "StreamingSpeechQueue"
Cohesion: 0.25
Nodes (4): extractCleanSpeechText(), splitSpeechSentences(), StreamingSpeechQueue, StreamingSpeechQueueOptions

### Community 62 - "paper_set.py"
Cohesion: 0.43
Nodes (13): build_parser(), cmd_add(), cmd_export(), cmd_mark_expanded(), cmd_stats(), _load_state(), main(), _normalize_items() (+5 more)

### Community 63 - "style_kit.py"
Cohesion: 0.14
Nodes (8): Generate fig_02_horizon_sweep.pdf — MSE vs forecast horizon (publication style)., Generate fig_03_method_x_dataset_heatmap.pdf — MSE heatmap across methods × data, Generate fig_04_ablation_panels.pdf — 2x2 ablation panel figure., apply_publication_style(), Shared publication-style helpers for experiment-suite figures., Apply a shared journal-style matplotlib configuration., Save PDF/SVG/TIFF together when possible., save_publication_bundle()

### Community 64 - "html2pdf-next.js"
Cohesion: 0.24
Nodes (12): collectStats(), convert(), { execSync, spawnSync }, fs, loadPdfLib(), loadPlaywright(), path, postProcess() (+4 more)

### Community 65 - "batch_html2pptx.js"
Cohesion: 0.25
Nodes (13): buildPptxFromDir(), collectHtmlFiles(), defaultOutputPath(), findSlidesDirs(), fs, html2pptx, main(), path (+5 more)

### Community 66 - "check_slides.py"
Cohesion: 0.29
Nodes (12): Semaphore, _collect_targets(), _detect_largest_blank(), _format_report(), main(), _measure_all(), _measure_one(), measure_slide_dimensions() (+4 more)

### Community 67 - "design_engine.py"
Cohesion: 0.21
Nodes (12): _parse_align(), _parse_grid_area(), _prevent_orphan_chars(), Prevent orphan characters at end of paragraphs.     Replace the last space/brea, Lightweight markdown → HTML for Glass Canvas. Handles paragraphs, headers, bold,, Parse grid_area from component JSON.     Accepts two formats:       - Array:, Parse align from component JSON.     Format: "vertical / horizontal" where each, Wrap a rendered component in a .grid-item div with grid positioning. (+4 more)

### Community 68 - "compile_blueprint"
Cohesion: 0.18
Nodes (13): audit_palette(), compile_blueprint(), derive_intent(), generate_continuous_flow_svg(), generate_unified_svg(), main(), palette_to_css(), Auto-derive design intent from document title/description.     Scans for theme (+5 more)

### Community 69 - "form_annotate"
Cohesion: 0.15
Nodes (13): form_annotate(), form_check_bbox(), form_validate(), get_bounding_box_messages(), _normalise_fields_json(), Transform bounding box from image coordinates to PDF coordinates., Accept both the current sheet-based schema and the legacy flat schema.      Cu, Fill a PDF by adding text annotations (FreeText) defined in fields.json. (+5 more)

### Community 70 - "aggregate_benchmark.py"
Cohesion: 0.23
Nodes (12): aggregate_results(), calculate_stats(), generate_benchmark(), generate_markdown(), load_run_results(), main(), Path, Aggregate run results into summary statistics.      Returns run_summary with s (+4 more)

### Community 71 - "speech.ts"
Cohesion: 0.27
Nodes (11): SpeakButton(), SpeakButtonProps, cachedVoices, cleanTextForSpeech(), fallbackToBrowserSpeech(), getBestPortugueseVoice(), NEURAL_VOICES, NeuralVoice (+3 more)

### Community 72 - "document-generator.ts"
Cohesion: 0.27
Nodes (11): DocumentSpec, DocumentType, EXTENSIONS, GeneratedDocumentResult, generateDocumentBlob(), generateExcel(), generatePdf(), generatePowerPoint() (+3 more)

### Community 73 - "manifest.json"
Cohesion: 0.17
Nodes (11): background_color, description, display, icons, id, name, orientation, scope (+3 more)

### Community 75 - "generate_cascade_palette"
Cohesion: 0.18
Nodes (12): audit_cascade_palette(), _cascade_to_css(), _cascade_to_reportlab(), _contrast_ratio(), generate_cascade_palette(), WCAG 2.1 relative luminance from hex color., WCAG contrast ratio between two hex colors., Generate a role-based palette cascade where every color is derived from one (+4 more)

### Community 76 - "form_fill_legacy"
Cohesion: 0.17
Nodes (12): form_detail(), form_fill_legacy(), _get_field_info(), _get_full_annotation_field_id(), _make_field_dict(), _monkeypatch_pypdf_method(), Build dotted field ID by walking parent chain., Extract detailed field info from a PdfReader, including radio group aggregation. (+4 more)

### Community 77 - "voice-button.tsx"
Cohesion: 0.35
Nodes (9): VoiceButton(), VoiceButtonProps, ActiveRecording, getSupportedAudioMimeType(), isBrowserSpeechRecognitionSupported(), isMediaRecorderSupported(), sendAudioToTranscribe(), startAudioRecording() (+1 more)

### Community 78 - "jd_gap.py"
Cohesion: 0.31
Nodes (10): analyze(), find_evidence(), fuzzy_hit(), load_resume_text(), main(), process_one(), Path, 在简历里找关键词，返回上下文片段；找不到返回 None。 (+2 more)

### Community 79 - "generate_generative_svg"
Cohesion: 0.24
Nodes (11): generate_generative_svg(), generate_grid_svg(), generate_noise_svg(), generate_ordered_texture_svg(), generate_supergraphic_svg(), Grid mode: architectural reference grid.     Ultra-faint 1px lines creating und, Noise mode: feTurbulence grain texture.     Adds tactile paper-like quality., Supergraphic mode: oversized geometric shapes (circles, rectangles, polygons) (+3 more)

### Community 80 - "build_quiz_html.py"
Cohesion: 0.31
Nodes (10): auto_subtitle(), load_questions(), main(), Any, Path, 根据题目自动生成副标题：题量 + 涉及分类。, HTML 安全转义（仅用于 title/subtitle 这种纯文本占位符）。, render() (+2 more)

### Community 81 - "main"
Cohesion: 0.35
Nodes (10): ats_friendliness(), coverage(), jd_extract_keywords(), load_keywords(), load_resume_text(), main(), Path, 从 JD 文本里抽取候选关键词。简易版：取常见技能/工具/动词。 (+2 more)

### Community 82 - "mcp-client.ts"
Cohesion: 0.44
Nodes (9): buildMcpRpcRequest(), convertMcpToolsToOpenAi(), executeMcpToolCall(), McpRpcRequest, parseMcpResponsePayload(), parseMcpToolResponse(), runTests(), testMcpConnection() (+1 more)

### Community 83 - "wake-lock.ts"
Cohesion: 0.29
Nodes (8): clearMediaSession(), getSilentWavBlobUrl(), KeepAliveOptions, keepScreenAlive(), requestLock(), setupMediaSession(), startBackgroundKeepAlive(), stopBackgroundKeepAlive()

### Community 84 - "apply-dss-theme.mjs"
Cohesion: 0.24
Nodes (7): css, dark, head, hexToRgb(), lerpColor(), rgbToHex(), start

### Community 85 - "generate_color_palette"
Cohesion: 0.20
Nodes (10): generate_color_palette(), _hex_to_rgb(), _hsl_to_hex(), _make_role(), Convert HSL (h: 0-360, s: 0-1, l: 0-1) to hex string., Nudge accent hue away from muddy/ugly zones toward attractive neighbors., Convert hex to 'r,g,b' string for rgba() usage., Generative Color Harmony Engine — geometric accent computation + 5 aesthetic mod (+2 more)

### Community 86 - "package_skill"
Cohesion: 0.29
Nodes (8): main(), package_skill(), Path, Check if a path should be excluded from packaging., Package a skill folder into a .skill file.      Args:         skill_path: Pat, should_exclude(), Basic validation of a skill, validate_skill()

### Community 87 - "package.json"
Cohesion: 0.22
Nodes (8): ., author, description, files, license, main, name, version

### Community 88 - "test-cf-splitter.ts"
Cohesion: 0.28
Nodes (4): CLOSE, emitAndFlush(), OPEN, Splitter

### Community 89 - "star_story_builder.py"
Cohesion: 0.36
Nodes (8): categorize_story(), extract_experiences(), load_resume_text(), main(), Path, 简易抽取：找形如 "公司 | 岗位 | 时间" 或 "项目名 | ..." 的行作为锚点，     然后取该行后面、下一个锚点之前的内容作为经历内容。, 根据 bullet 关键词，判断这个故事最适合回答哪一类行为题。, render()

### Community 90 - "_gather_fields"
Cohesion: 0.22
Nodes (9): _classify_field(), _current_value(), _extra_props(), form_info(), _gather_fields(), Walk the AcroForm field tree iteratively and return a flat list., Return structured JSON describing every form field (pikepdf + check_fillable)., Map a PDF field type token to a human label. (+1 more)

### Community 91 - "copy-cf-artifacts.mjs"
Cohesion: 0.29
Nodes (7): COPY_ARTIFACTS, __dirname, DIST, exists(), __filename, main(), ROOT

### Community 92 - "neutralize-dark.mjs"
Cohesion: 0.25
Nodes (4): css, dark, head, start

### Community 93 - "main"
Cohesion: 0.39
Nodes (7): extract_keywords(), main(), match_score(), Path, 简单解析 markdown，把所有 bullet 后面的中英文词汇收集起来。, 返回匹配命中、缺失、命中率。模糊匹配：包含即算命中。, render_report()

### Community 94 - "_auto_assign_grid_areas"
Cohesion: 0.29
Nodes (8): _assign_floating_meta(), _auto_assign_grid_areas(), _distribute_rows_by_weight(), _estimate_content_weight(), Estimate the visual weight (space needed) of a component based on its content., Assign grid_area to a Floating_Meta component based on its position., Distribute grid rows among content components proportionally to their content we, Auto-assign grid_area to components that don't have one,     based on the arche

### Community 95 - "pack_document"
Cohesion: 0.36
Nodes (7): condense_xml(), main(), pack_document(), Strip unnecessary whitespace and remove comments., Pack a directory into an Office file (.docx/.pptx/.xlsx).      Args:, Validate document by converting to HTML with soffice., validate_document()

### Community 96 - "extract_pptx_style.py"
Cohesion: 0.39
Nodes (7): _hex_from_node(), main(), parse_theme(), Element, Inspect actual srgbClr fills + rPr typefaces used on slide 1., sample_slide_usage(), synthesize_design()

### Community 97 - "list_examples"
Cohesion: 0.38
Nodes (6): check_library(), list_examples(), prune_oldest(), List all blog examples sorted by date (oldest first)., Check library status and recommend pruning if needed., Remove the oldest examples to bring library under limit.

### Community 98 - "parse_jd.py"
Cohesion: 0.48
Nodes (6): classify_sentences(), extract_skills(), extract_special(), main(), 从所有句子里抽取技能词候选（短词优先，避免抽出整句）。, split_sentences()

### Community 99 - "generate_visual"
Cohesion: 0.48
Nodes (6): generate_visual(), get_script_path(), main(), Path, Get the path to the appropriate generation script., Generate a single visual using the appropriate tool.

### Community 100 - "cover_validate.js"
Cohesion: 0.43
Nodes (6): dimToPx(), fs, main(), parseArgs(), path, resolveChromium()

### Community 101 - "html2poster.js"
Cohesion: 0.38
Nodes (6): fs, main(), parseArgs(), path, resolveChromium(), { spawnSync }

### Community 102 - "video.ts"
Cohesion: 0.48
Nodes (6): create(), createFromImage(), displayResult(), main(), query(), IMPORTANT: Using base64-encoded image data is STRONGLY RECOMMENDED over URLs

### Community 103 - "style_total_row"
Cohesion: 0.29
Nodes (7): border_total(), fill_total(), font_subheader(), 11pt sub-header — primary color text., Medium top border above totals row., Apply totals row style., style_total_row()

### Community 104 - "SelectedPreviewElement"
Cohesion: 0.48
Nodes (5): ElementSourceLocation, formatElementInspectorPrompt(), locateElementInProjectFiles(), normalizePath(), SelectedPreviewElement

### Community 105 - "generate-favicons.mjs"
Cohesion: 0.33
Nodes (4): __dirname, __filename, ROOT, SVG_PATH

### Community 106 - "setup.sh"
Cohesion: 0.60
Nodes (5): fail(), info(), ok(), setup.sh script, warn()

### Community 107 - "setup.sh"
Cohesion: 0.60
Nodes (5): fail(), info(), ok(), setup.sh script, warn()

### Community 108 - "setup_mac_linux.sh"
Cohesion: 0.60
Nodes (5): fail(), info(), ok(), setup_mac_linux.sh script, warn()

### Community 109 - "generate_flow_svg"
Cohesion: 0.33
Nodes (6): _generate_data_driven_svg(), generate_flow_svg(), _random_bezier_path(), Generate a single flowing bézier curve across the canvas., Flow mode: ultra-wide, ultra-faint bézier curves.     Creates atmospheric depth, Content-Aware SVG: Transform business data arrays into Bézier background curves.

### Community 110 - "_best_font_for_char"
Cohesion: 0.33
Nodes (6): _best_font_for_char(), font_fallback(), _has_glyph(), Check whether *font_name* has a real glyph outline for *code*., Return the best registered font for a single character *code*., Wrap characters that *base_font* cannot render with ``<font>`` tags.      Pres

### Community 111 - "content_sanitize"
Cohesion: 0.33
Nodes (6): content_sanitize(), content_sanitize_cli(), Sanitize Paragraph text content before font fallback.      Removes/replaces ch, Process a single character. Returns replacement string, or None to delete., Sanitize content text for PDF rendering (dry-run report).      Reads a text fi, _sanitize_one_char()

### Community 112 - "setup.sh"
Cohesion: 0.60
Nodes (5): fail(), info(), ok(), setup.sh script, warn()

### Community 113 - "unpack_document"
Cohesion: 0.47
Nodes (5): main(), pretty_print_xml(), Unpack an Office file into a directory and pretty-print all XML files., Pretty-print a single XML file in place., unpack_document()

### Community 114 - "fetch-rendered-dom.mjs"
Cohesion: 0.33
Nodes (5): chromiumMarker, consoleLogs, networkRequests, pwDir, runnerDir

### Community 115 - "setup.sh"
Cohesion: 0.60
Nodes (5): fail(), info(), ok(), setup.sh script, warn()

### Community 116 - "_apply"
Cohesion: 0.33
Nodes (6): _apply(), Auto-detect style from user prompt and switch all color tokens.     Call this B, Manually select a palette by style name.     Available: professional, warm, ele, Internal: apply a palette dict to all module-level color tokens., use_palette(), use_palette_explicit()

### Community 118 - "generate-png-icons.mjs"
Cohesion: 0.60
Nodes (4): crc32(), crcTable, createChunk(), createPNG()

### Community 119 - "main"
Cohesion: 0.80
Nodes (4): main(), Path, write_md(), write_xlsx()

### Community 121 - "check_missing_glyphs"
Cohesion: 0.40
Nodes (5): check_missing_glyphs(), font_check(), Any, Scan a PDF for .notdef glyphs, control chars, and other problematic characters., Scan a PDF for missing glyphs (□ boxes) after generation.

### Community 122 - "setup_sheet"
Cohesion: 0.40
Nodes (5): align_title(), font_title(), 16pt title font — left-aligned, no fill., Apply standard sheet setup:       - hide grid lines       - set margin column, setup_sheet()

### Community 123 - "style_data_row"
Cohesion: 0.40
Nodes (5): fill_data_row(), font_body(), Alternating row: even=white, odd=warm-white., Apply data row style (alternating fill)., style_data_row()

### Community 124 - "vercel.json"
Cohesion: 0.40
Nodes (4): buildCommand, headers, outputDirectory, rewrites

### Community 125 - "magazine-bg-webgl.js"
Cohesion: 0.83
Nodes (3): fallback2d(), mount(), rgb()

### Community 126 - "magazine-bg-webgl.js"
Cohesion: 0.83
Nodes (3): fallback2d(), mount(), rgb()

### Community 128 - "calculate_layout"
Cohesion: 0.50
Nodes (4): calculate_layout(), _divide_vertical(), Calculate positioned layout for named elements.          Args:         elemen, Divide a rectangle into n vertical bands with golden-ratio-inspired proportions.

### Community 129 - "package.json"
Cohesion: 0.50
Nodes (3): description, name, version

### Community 130 - "make_chart_title"
Cohesion: 0.50
Nodes (4): make_chart_title(), Build a chart Title with font baked into <tx><rich><defRPr>/<rPr>.     Ensures, Set chart title and axis titles using make_chart_title() for     cross-platform, setup_chart_titles()

### Community 131 - "safe-thinking-orb.tsx"
Cohesion: 0.67
Nodes (3): SafeThinkingOrb(), SafeThinkingOrbProps, VALID_STATES

### Community 133 - "@stackblitz/sdk"
Cohesion: 0.67
Nodes (3): @stackblitz/sdk, StackBlitzPreview(), @stackblitz/sdk

## Knowledge Gaps
- **367 isolated node(s):** `config`, `config`, `config`, `NormalizedDeploymentStatus`, `config` (+362 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **42 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `@stackblitz/sdk`, `github.ts`, `clsx`, `scripts`, `docx`, `dotenv`, `@codesandbox/sandpack-react`, `exceljs`, `idb-keyval`, `jspdf`, `motion`, `pptxgenjs`, `express`, `react-dom`, `jspdf-autotable`, `tailwind-merge`, `react-markdown`, `vite`, `tsx`, `@vitejs/plugin-react`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `react` connect `github.ts` to `App.tsx`, `dependencies`, `GlobalErrorBoundary`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `AppContent()` connect `App.tsx` to `subagent-runner.ts`, `video.ts`, `github.ts`, `deployment-service.ts`, `document-generator.ts`, `chat-message.tsx`, `SelectedPreviewElement`, `preview-html.ts`, `speech.ts`, `types.ts`, `studio-panel.tsx`, `mcp-client.ts`, `graphify-engine.ts`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `AppContent()` (e.g. with `query()` and `getInitialTheme()`) actually correct?**
  _`AppContent()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 28 inferred relationships involving `main()` (e.g. with `org_detail()` and `org_disambiguate()`) actually correct?**
  _`main()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `Document` (e.g. with `_extract_headings_from_docx()` and `XMLEditor`) actually correct?**
  _`Document` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `config`, `config`, `config` to the rest of the system?**
  _367 weakly-connected nodes found - possible documentation gaps or missing edges._