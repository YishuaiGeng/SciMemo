# SciMemo token contrast

Computed on 2026-10-13 directly from `scimemo-tokens.json` with Python using the WCAG relative-luminance formula. Ratios use opaque sRGB colors. Pass/fail uses unrounded values.

Normal text target: **4.5:1**. Visible controls and focus indicators target: **3:1**. The muted text and control-border tokens were darkened or lightened slightly from the initial direction so they pass across every intended surface, including selected navigation.

## Text and interactive roles

“Worst surface” is the lowest ratio across canvas, surface, elevated, sidebar, selected navigation, note surface and decorative fill. Semantic chips use their own paired foreground/background below.

| Mode / role | Foreground | Background | Contrast | 4.5:1 text |
|---|---|---|---:|---|
| light / text / worst: navSelected | `#0B2D5B` | `#DCEEFF` | 11.50:1 | Pass |
| light / textSecondary / worst: navSelected | `#526780` | `#DCEEFF` | 4.91:1 | Pass |
| light / textMuted / worst: navSelected | `#586C82` | `#DCEEFF` | 4.56:1 | Pass |
| light / link / worst: navSelected | `#0866C8` | `#DCEEFF` | 4.73:1 | Pass |
| light / action label | `#FFFFFF` | `#0866C8` | 5.61:1 | Pass |
| light / actionHover label | `#FFFFFF` | `#0755A8` | 7.31:1 | Pass |
| dark / text / worst: navSelected | `#EEF5FF` | `#123D68` | 10.11:1 | Pass |
| dark / textSecondary / worst: navSelected | `#ACBED4` | `#123D68` | 5.85:1 | Pass |
| dark / textMuted / worst: navSelected | `#96ACC5` | `#123D68` | 4.76:1 | Pass |
| dark / link / worst: navSelected | `#75C8FF` | `#123D68` | 6.05:1 | Pass |
| dark / action label | `#08264A` | `#64C8FF` | 8.11:1 | Pass |
| dark / actionHover label | `#08264A` | `#8AD6FF` | 9.48:1 | Pass |

## Semantic chips

| Mode / tone | Foreground | Background | Contrast | 4.5:1 text |
|---|---|---|---:|---|
| light / neutral | `#4C6079` | `#EEF3F8` | 5.78:1 | Pass |
| light / processing | `#075DAE` | `#E9F3FF` | 5.88:1 | Pass |
| light / warning | `#865400` | `#FFF2D6` | 5.77:1 | Pass |
| light / success | `#176443` | `#E7F5ED` | 6.35:1 | Pass |
| light / danger | `#A33A32` | `#FDECE9` | 5.72:1 | Pass |
| light / conflict | `#6F3A9F` | `#F2EBFA` | 6.48:1 | Pass |
| dark / neutral | `#BED0E5` | `#26384F` | 7.58:1 | Pass |
| dark / processing | `#A5D6FF` | `#123B61` | 7.49:1 | Pass |
| dark / warning | `#FFD178` | `#45361A` | 8.16:1 | Pass |
| dark / success | `#99DDB8` | `#153E32` | 7.58:1 | Pass |
| dark / danger | `#FFB4AC` | `#482B2B` | 7.47:1 | Pass |
| dark / conflict | `#D9B7FF` | `#382750` | 7.73:1 | Pass |

## Controls and focus

| Mode / role / worst surface | Foreground | Background | Contrast | 3:1 indicator |
|---|---|---|---:|---|
| light / controlBorder / navSelected | `#6E86A2` | `#DCEEFF` | 3.17:1 | Pass |
| light / focus / navSelected | `#0866C8` | `#DCEEFF` | 4.73:1 | Pass |
| dark / controlBorder / navSelected | `#708CAC` | `#123D68` | 3.19:1 | Pass |
| dark / focus / navSelected | `#FFB93C` | `#123D68` | 6.47:1 | Pass |

Use `controlBorder` when the boundary identifies an input or interactive control. The softer `border`, `noteBorder`, and semantic chip borders are decorative separators and do not independently meet the control contrast target. Focus uses a 3px ring with a 3px offset, so this calculation concerns the ring against the surrounding surface.

## Brand accent restrictions

| Accent | Foreground | Background | Contrast | 4.5:1 text |
|---|---|---|---:|---|
| blue | `#1E88FF` | `#FFFFFF` | 3.49:1 | Below target |
| sky | `#64C8FF` | `#FFFFFF` | 1.87:1 | Below target |
| gold | `#FFB93C` | `#FFFFFF` | 1.71:1 | Below target |
| blush | `#FFB6A7` | `#FFFFFF` | 1.68:1 | Below target |

Keep these accent combinations decorative. Use the role-based `action` color for controls with text. Preserve the original brand colors in the logo; this report does not claim that small logo lettering meets a UI text contrast requirement.

## State meaning

The six work-stage keys and nine submission-status keys are separate mappings. Every work stage uses a neutral tone; `finished` adds a check symbol and means the author marked the work finished. Only submission `accepted` uses the acceptance success tone. Submission rejection is a recorded outcome; it is not a failed save.

Submission states always need their explicit text labels. Keep major and minor revisions distinguishable by wording. Date-only records keep date-only wording; the calendar symbol does not imply a missing time or a system notification.

Colors alone do not establish full accessibility. This calculation does not test text rendering, focus visibility under clipping, keyboard operation, screen readers, native rendering, device behavior, or forced-colors mode.
