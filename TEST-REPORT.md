# Registration backend test report

Executed with `npm test` on 2026-10-12. The suite uses mocked repositories and a fresh in-memory database per integration test; no Supabase credentials or production registrations were accessed.

| Case | Expected result | Actual result | Status |
|---|---|---|---|
| Health endpoint | `200`, `{ success: true, message: "ok" }` | Returned `200` and expected body | PASS |
| Valid registration with normalized fields | `201`; normalized name, Sr. No., email | Returned `201`; values normalized | PASS |
| Missing USN storage | Accepted and stored as SQL `NULL` equivalent | Returned `201`; repository received `null` | PASS |
| Two registrations without USN | Both accepted | Both returned `201`; both stored `null` | PASS |
| All configured branches | Accepted | All 8 branches accepted | PASS |
| All configured years | Accepted | All 4 years accepted | PASS |
| Name validation | Blank, short, and overlong names rejected | Returned `400` with name errors | PASS |
| Sr. No. validation | Invalid formats, incorrect lengths, and internal whitespace rejected | Returned `400` with Sr. No. errors | PASS |
| Sr. No. zero serial | `00-0000` and `24-0000` rejected and not saved | Returned `400`; repository was not called | PASS |
| USN validation | Invalid formats, incorrect lengths, internal whitespace, and lowercase input handled correctly | Returned `400` for invalid values and normalized valid input | PASS |
| USN zero serial | `1JS24IS000` rejected and not saved | Returned `400`; repository was not called | PASS |
| Missing optional USN | Accepted and normalized to `null` | Valid requests returned `201`; stored value was `null` | PASS |
| Email validation | Malformed and overlong addresses rejected | Returned `400` with email errors | PASS |
| Branch and year validation | Unsupported values rejected | Returned `400` with field errors | PASS |
| Name/Sr. No./USN/email normalization | Whitespace, Unicode dash, case, and zero-width input normalized | Expected normalized values observed | PASS |
| Malformed request shapes | `null`, arrays, non-text fields, and extra fields rejected | Returned validation errors | PASS |
| Direct API invalid requests | Frontend bypass cannot persist invalid data | All exercised requests returned `400` | PASS |
| Sr. No. uniqueness | Duplicate rejected with `409` | Returned `409` | PASS |
| USN uniqueness | Duplicate rejected with `409` | Returned `409` | PASS |
| Email uniqueness | Duplicate rejected with `409` | Returned `409` | PASS |
| Simultaneous duplicate submissions | Exactly one insert succeeds | Statuses were `201` and `409`; one row stored | PASS |
| Gmail dot equivalence | Gmail dotted alias rejected as duplicate | `ada@gmail.com` vs `a.da+club@googlemail.com` returned `409` | PASS |
| Gmail plus-tag equivalence | Gmail plus-tag alias rejected as duplicate | Returned `409` | PASS |
| Non-Gmail plus-tag policy | Plus-tag remains distinct for unrelated providers | `ada@example.com` and `ada+club@example.com` both returned `201` | PASS |
| Malformed JSON | Safe `400` response | Returned `400` | PASS |
| Database failure | Safe `500` without leaking details | Returned generic `500` response | PASS |
| Honeypot/repeated submission handling | Bot submission returns fake success without insert | Returned `201`; database remained empty | PASS |

## Summary

- **26 tests passed, 0 failed, 0 skipped**
- `npm run build` also completed successfully. Vite emitted existing third-party `"use client"` directive warnings only.
- The test run exposed and fixed two backend issues: duplicate constraint names were not read from `error.constraint`, and the SQL email key incorrectly stripped plus-tags from non-Gmail providers.
