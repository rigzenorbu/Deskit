# Project DYESKIT — Ladakh Village Well-Being Questionnaire & Scoring (v2)

**A comprehensive household instrument for Leh + Kargil, with a reliable 0–1 scoring model.**

*Self-contained document. Contains four parts:*
1. **Why the Bhutan questionnaire could not be used as-is** — its drawbacks
2. **The questionnaire** — ~70 items, 9 sections, all 7 DYESKIT dimensions
3. **The scoring model** — graduated 0–1 normalization (drawn from the project's separate scoring-definition reference, *not* DYESKIT's original 1/0.5/0 adequacy scale)
4. **Analysis & reliability guide**

**Respondent:** one adult household member (18+). **Mode:** interviewer-administered. **Target time:** 20–25 min.
**Likert convention:** `1 = Strongly Disagree · 2 = Disagree · 3 = Neutral · 4 = Agree · 5 = Strongly Agree`.

---

# PART 1 — Drawbacks of the Bhutan Questionnaire (and why v2 departs from it)

The Ladakh instrument was built from the Bhutan household-survey source (the 117-page mobile app specification / Data Architecture Map). That source is excellent for its purpose but is **not a wellness questionnaire** — it is an administrative data-entry app. Using it unchanged fails in specific, concrete ways:

| # | Drawback of the Bhutan source | Consequence | How v2 fixes it |
|---|---|---|---|
| 1 | **Built as an app, not an interview.** Per-land-parcel geotags, per-house equipment inventories, per-crop input/output accounting, a 90-item chronic-disease dropdown. | 400–788 fields; impossible in a 20-minute sitting; respondent fatigue destroys data quality. | Collapsed app-level granularity into **survey-level indicator questions** answerable in one sitting. |
| 2 | **No high-altitude or winter-isolation content.** | Misses the defining health and access risks of Ladakh — AMS, snow-cut roads, seasonal healthcare loss. | Added altitude-illness, winter healthcare cut-off, and winter-isolation items. |
| 3 | **No glacier / cold-desert water framing.** Water items assume rivers/rainfall. | Misses Ladakh's glacier-melt and *yura*-channel dependence — its single biggest environmental vulnerability. | Water source list includes glacier-melt channel, spring (*chumik*), snowmelt; added glacier-change perception. |
| 4 | **Bhutan-specific demographics and roles.** "Long House," fisherman, Bhutanese admin units, no Buddhist–Muslim split. | Wrong categories for Ladakh; can't distinguish Leh (Buddhist-majority) from Kargil (Muslim-majority). | Localized housing types, occupations (Changpa pastoralist, army-affiliated, homestay), religion, Leh/Kargil district. |
| 5 | **No tourism, outmigration, or cultural-erosion items.** | Misses three forces DYESKIT names as central to Ladakh's transition. | Added tourism dependence/pressure, youth-migration, and cultural-continuity items. |
| 6 | **Crude 3-point native scale (1 / 0.5 / 0).** A BMI of 24 and 17 score identically; a ₹95k and ₹2.9L income both score "0.5". Eleven Likert items were collected but never scored. | Throws away real variation; makes villages look more similar than they are; wastes measured data. | Replaced with **graduated 0–1 normalization** (Part 3), which scores the full range and uses every item collected. |
| 7 | **No consent / ethics preamble; sensitive items unprotected.** | Substance-use and emotional items asked without a protocol — an ethics and data-quality risk. | Added a consent preamble (§0) and a private-response protocol for the sensitive item. |
| 8 | **Currency, schemes, standards all Malaysian/Bhutanese** in the associated scoring files. | Thresholds (RM income, Malaysian ministries, 60% forest cover, plains health ratios) are meaningless in Ladakh. | Thresholds re-anchored to Indian references — ICMR BMI, IPHS hilly norms, ₹ bands, RTE distances (Part 3 §D). |

**Net effect:** v2 keeps the *substance* the Bhutan tool captured well (emotional state, coping, support, community, assets) and discards its administrative bulk, its wrong geography, and its lossy scale.

---

# PART 2 — The Questionnaire

**Column key.** **Dim** = scored dimension: `Phy` Physical · `Fin` Financial · `Emo` Emotional · `Soc` Social · `Env` Environmental · `Int` Intellectual · `Spi` Spiritual · `—` unscored (context/diagnostic). **Every scored item maps to exactly one dimension**, so the 7-dimension model is clean.

## §0 — Consent (read aloud; not scored)

> "Namaskar/Julley. I'm working with Project DYESKIT, a study of village well-being in Ladakh. I'd like to ask about your household — health, work, community, environment, and how you feel about life here. It takes about 20 minutes. **Your answers are confidential and combined with others; nothing is linked to you by name.** You may skip any question or stop anytime. A few questions are personal — you may decline them. Do you agree to take part?"  ☐ Yes ☐ No *(if No, close courteously)*

## Section A — Household & Demographic Profile *(context; A13 scores → Intellectual)*

| # | Question | Type | Options |
|---|---|---|---|
| A1 | Village | Dropdown | *[from sampling frame]* |
| A2 | Block / Tehsil | Dropdown | *[Ladakh admin units]* |
| A3 | District | Single | Leh / Kargil |
| A4 | Years household has lived here | Numeric | ___ years |
| A5 | Respondent age | Numeric | ___ years |
| A6 | Gender | Single | Male / Female / Other / Prefer not to say |
| A7 | Household size (usually resident) | Numeric | ___ |
| A8 | Members living away for work/study | Numeric | ___ (0 if none) |
| A9 | Family type | Single | Nuclear / Joint / Extended |
| A10 | Religion | Single | Buddhist / Muslim / Hindu / Christian / Other / PNA |
| A11 | Housing type | Single | Traditional stone/mud-brick / Concrete-cement / Modern hybrid / Other |
| A12 | Main earner's occupation | Single | Farmer / Pastoralist (Changpa) / Tourism operator–guide / Homestay operator / Handicraft artisan / Govt employee / Teacher / Healthcare worker / Transport operator / Small business / Monk–Nun–religious / Army–defence / Daily-wage labour / Student / Homemaker / Other |
| A13 | Highest education in household | Single (→**Int**) | No formal / Primary / Secondary / Higher secondary / Diploma / Bachelor's / Master's / Doctorate / Monastic / Vocational / Other |

## Section B — Physical Wellness *(→ Phy; B9–B10 → Env)*

> **Interviewer note (B1):** *measure* height and weight with the kit. Do **not** accept self-report. If no kit in this village, mark **NC**.

| # | Question | Type | Options | Dim |
|---|---|---|---|---|
| B1 | Measured height & weight | Numeric | ___ cm / ___ kg (or NC) | Phy |
| B2 | Diagnosed chronic illness? | Single | None / Managed with medication / Unmanaged or severe / DK | Phy |
| B2a | *If yes,* which? (optional) | Open | Text | — |
| B3 | Altitude symptoms (breathlessness, chronic headache, fatigue)? | Single | Never / Occasionally / Frequently | Phy |
| B4 | Nearest health facility you'd use | Single | In village / Mobile camp / 1–10 km / 11–20 km / >20 km | Phy |
| B5 | Last year, unable to reach care due to snow/road/distance? | Single | Never / Once / More than once | Phy |
| B6 | Typical daily physical activity | Single | Active work (farming, herding, labour) / Moderate / Sedentary | Phy |
| B7 | Adequate sleep (~7h) most nights? | Single | Always / Mostly / Rarely / Never | Phy |
| B8 | Household toilet | Single | Toilet + proper waste / Traditional dry-compost / Toilet without proper disposal / No toilet | Phy |
| B9 | Drinking water source(s) | Multi | Piped / Glacier-melt channel (*yura*) / Spring (*chumik*) / Stream–river / Borewell / Tanker / Snowmelt storage | Env |
| B10 | Drinking water quality | Single | Safe as-is / Needs boiling–filtration / Occasionally contaminated / Unsafe / DK | Env |
| B11 | "I am satisfied with my physical health." | Likert 1–5 | 1–5 | Phy |

## Section C — Mental & Emotional Wellness *(→ Emo)*

| # | Question | Type | Options | Dim |
|---|---|---|---|---|
| C1 | Overall, how do you feel emotionally? | Single | Fit (calm, focused) / Generally stable / Facing challenges / PNA | Emo |
| C2 | What emotional support can you turn to? | Multi | Family–friends / Religious–spiritual community / Professional (counselling) / Personal coping (prayer, walking, art) / None / PNA | Emo |
| C3 | How do you recover from stress? | Single | Low stress, quick recovery / Moderate / High, difficult / PNA | Emo |
| C4 | "In the last month I have felt hopeful about the future." | Likert 1–5 | 1–5 | Emo |
| C5 | Overall life satisfaction | Likert 1–5 | 1 = Very dissatisfied → 5 = Very satisfied | Emo |
| C6 | "I feel isolated or cut off during winter months." *(reverse)* | Likert 1–5 | 1–5 | Emo |
| C7 | Do household members regularly use any of these? *(sensitive — see protocol)* | Multi | Tobacco / Alcohol / Local brew (*chhang*) / None / PNA | — |

> **C7 protocol:** not scored (self-report under-reports); reported only as a village prevalence flag. Where literacy allows, hand the respondent the card to mark privately. Interviewer keeps a neutral tone.

## Section D — Social Wellness *(→ Soc)*

| # | Question | Type | Options | Dim |
|---|---|---|---|---|
| D1 | Participation in community activities (festivals, meetings, collective labour) | Frequency | Regular / Occasional / None | Soc |
| D2 | "I trust the people in my village." | Likert 1–5 | 1–5 | Soc |
| D3 | Level of conflict/tension in the village | Single | High trust, low conflict / Moderate / Frequent conflict | Soc |
| D4 | Do women & marginalized groups take part equally in decisions? | Single | Equal / Partial / Exclusion | Soc |
| D5 | "Elders are respected and youth are engaged in village life." | Likert 1–5 | 1–5 | Soc |
| D6 | A village institution you can turn to? | Multi | Village Committee / *Goba* / LAHDC body / Monastery committee / Mosque–*anjuman* committee / Women's group–SHG / Youth group / None functions | Soc |
| D7 | "My community would help my household in an emergency." | Likert 1–5 | 1–5 | Soc |
| D8 | Youth from the household left for work/study in last 3 years? | Single | No / Yes | — |
| D8a | *If yes,* how many? | Numeric | ___ | — |

## Section E — Environmental Wellness *(→ Env; with B9–B10)*

| # | Question | Type | Options | Dim |
|---|---|---|---|---|
| E1 | Water supply reliable through the year? | Single | Reliable / Scarce some months / Severe shortage or contamination | Env |
| E1a | *If scarce,* how many months? | Numeric | ___ months | Env |
| E2 | Change in glacier melt / snowfall / stream flow over 10 yrs? | Single | Large decrease / Some decrease / No change / Increase / DK | — |
| E3 | Local/own-grown vs. packaged food | Single | Mostly local / Mixed / Mostly packaged | Env |
| E4 | Household waste practice | Single | Segregated + disposed / Partly managed / Burned / Open dumping | Env |
| E5 | Main cooking & **heating** fuel(s) | Multi | LPG / Firewood / Dung cakes / Kerosene / Electricity / Solar / Biogas | Env |
| E6 | Climate/water adaptation measures adopted? | Multi | Water storage tank / Ice stupa participation / Greenhouse–trombe wall / Passive-solar retrofit / Insulation / Rainwater–snowmelt harvesting / None | Env |
| E7 | "Tourist-related waste is a growing problem near my village." | Likert 1–5 | 1–5 | — |

## Section F — Economic & Occupational Wellness *(→ Fin)*

| # | Question | Type | Options | Dim |
|---|---|---|---|---|
| F1 | Yearly household income (all sources) | Single | <₹1L / ₹1–3L / ₹3–5L / ₹5–10L / >₹10L / PNA | Fin |
| F2 | Does income cover needs through the year? | Single | Covers + surplus / Covers basics only / Does not cover | Fin |
| F3 | Savings or assets to fall back on? | Single | Savings/land/livestock/SHG / Limited / None or in debt | Fin |
| F4 | Number of separate income sources | Numeric | ___ | Fin |
| F5 | Household earns from? | Multi | Farming / Livestock–pashmina / Tourism–guiding–transport / Homestay / Handicraft / Govt salary–pension / Daily-wage / Small business / Remittance / Other | Fin |
| F6 | In which months is most income earned? | Multi | Jan–Mar / Apr–Jun / Jul–Sep / Oct–Dec / Even year-round | Fin |
| F7 | Extreme-weather damage to crops/livestock/property in last 5 yrs? | Single | No / Once / More than once | Fin |
| F8 | "I feel financially secure about my household's future." | Likert 1–5 | 1–5 | Fin |
| F9 | Aware of / using a government livelihood scheme? *(MGNREGA, PM-KISAN, livestock insurance, homestay, PMAY)* | Single | Aware & using / Aware, not using / Not aware | Fin |
| F10 | Household has a bank account? | Single | Yes / No | Fin |

## Section G — Intellectual Wellness *(→ Int; with A13)*

| # | Question | Type | Options | Dim |
|---|---|---|---|---|
| G1 | Anyone currently learning a new skill/subject? | Frequency | Actively / Occasionally / Not at all | Int |
| G2 | Can you find & judge information using phone/computer/internet? | Single | Confidently / With some difficulty / No | Int |
| G3 | Aware of basic civic rights & entitlements? | Single | Well aware / Partly / Not aware | Int |
| G4 | Aware of climate change and its impact on Ladakh? | Single | Well aware / Partly / Not aware | Int |
| G5 | Barriers to education in your household? *(reverse)* | Multi | Distance / Cost / Winter closure / Lack of teachers / Language of instruction / No barriers | Int |

## Section H — Spiritual & Cultural Wellness *(→ Spi)*

| # | Question | Type | Options | Dim |
|---|---|---|---|---|
| H1 | How regularly do you pray, meditate, or do religious practice? | Frequency | Daily / Weekly / Occasionally / Never | Spi |
| H2 | "I have a clear sense of purpose and direction." | Likert 1–5 | 1–5 | Spi |
| H3 | "My decisions are guided by ethical/spiritual values." | Likert 1–5 | 1–5 | Spi |
| H4 | "I generally feel inner peace and contentment." | Likert 1–5 | 1–5 | Spi |
| H5 | Can you reach a monastery/mosque/place of worship when you wish? | Single | In village / Within 10 km / Beyond 10 km / Seasonal only | Spi |
| H6 | Festival/cultural participation *(interviewer: local examples — Losar/Hemis in Buddhist villages; Eid/Nowruz observances in Kargil)* | Frequency | Regular / Occasional / Never | Spi |
| H7 | Are younger people losing interest in Ladakhi language/festivals/practices? *(reverse)* | Single | Strongly agree / Agree / Neutral / Disagree / Strongly disagree | Spi |

## Section I — Technology, AI & Development Priorities *(diagnostic; NOT scored into the VWBI)*

| # | Question | Type | Options |
|---|---|---|---|
| I1 | Household has a smartphone? | Single | Yes, >1 / Yes, one / No |
| I2 | Internet access | Single | Reliable broadband–4G / Intermittent mobile data / None |
| I3 | Heard of / used an AI tool (chatbot, voice assistant)? | Single | Use it / Aware, don't use / Never heard |
| I4 | Would use a phone assistant for…? | Multi | Health info / Weather–road status / Scheme info / Farming–livestock advice / Education / Tourism–business / Not interested |
| I5 | Rank your village's top 3 development priorities | Ranking (top 3) | Water security / Healthcare / Roads–winter connectivity / Education / Employment / Renewable energy–heating / Waste management / Tourism management / Cultural preservation / Digital connectivity |

**Item count:** ~70 (A:13 · B:12 · C:7 · D:9 · E:8 · F:10 · G:5 · H:7 · I:5). Section I is diagnostic, reported separately.

---

# PART 3 — Scoring Model (Graduated 0–1 Normalization)

**This scale is deliberately *not* DYESKIT's original 1 / 0.5 / 0 adequacy scale.** It is adapted from the project's separate scoring-definition reference (the 0–1 normalized approach), because that scale is more suitable for this questionnaire: it captures the full range of each item instead of collapsing everything to three steps, and it uses the Likert items the adequacy scale discarded. See Part 1, drawback #6.

## A. Principles

- Every item → a score in **[0, 1]**.
- **Dimension score** = arithmetic **mean** of its valid item scores.
- **Individual Well-Being (IWB)** = mean of the 7 dimension scores (equal 1/7 weight each).
- **Never multiply** — one weak item must not zero a dimension.
- **Likert rescale:** `(x − 1) / 4`; reverse items `(5 − x) / 4`.

## B. Missing data & validity floors

| Code | Meaning | Treatment |
|---|---|---|
| NC | Not collected (e.g., no BMI kit) | Excluded — denominator shrinks |
| NA | Not applicable | Excluded |
| DK / RF / PNA | Don't know / refused | Score **0.5** (neutral) |

- **Dimension valid** only if ≥ 50% of its items (min 2) have real data — else report "insufficient data," not a number.
- **Individual valid** only if ≥ 5 of 7 dimensions valid.

## C. Item scoring rules

**Physical**
```
B1 BMI (MEASURED; ICMR / WHO-Asia cutoffs, NOT Western):
   18.5–22.9 → 1.0 | 23.0–24.9 → 0.7 | 17.0–18.4 → 0.6
   25.0–29.9 → 0.4 | 16.0–16.9 → 0.3 | else → 0.0   (blank → NC)
B2 chronic:  none 1.0 | managed 0.5 | unmanaged 0.0
B3 altitude: never 1.0 | occ 0.5 | freq 0.0
B4/B5 healthcare = mean(access, winter):
   access {in-vil/camp 1.0, 1–10km 0.75, 11–20km 0.5, >20km 0.0}
   winter {never 1.0, once 0.5, >once 0.0}
B6 activity: active 1.0 | moderate 0.5 | sedentary 0.0
B7 sleep: always 1.0 | mostly 0.67 | rarely 0.33 | never 0.0
B8 toilet: proper 1.0 | dry-compost 1.0 | no-disposal 0.5 | none 0.0
B11 self-rated health: (x−1)/4
```
> **Dry-compost toilet scores 1.0**, equal to a modern toilet — it is a water-saving, cold-adapted technology, not a deficiency.

**Environmental**
```
B9+B10 water quality: safe 1.0 | needs treatment 0.5 | occ-contam 0.25 | unsafe 0.0
E1+E1a reliability: reliable 1.0 | scarce → max(0, 1 − months/12) | severe 0.0
E3 local food: mostly-local 1.0 | mixed 0.5 | packaged 0.0
E4 waste: segregated 1.0 | partial 0.5 | burned 0.25 | dump 0.0
E5 fuel (score PRIMARY heating fuel): solar/electric/biogas 1.0 | LPG 0.75 | mixed 0.5 | firewood 0.33 | dung/kerosene 0.0
E6 adaptation (count): ≥2 → 1.0 | 1 → 0.5 | none → 0.0
```

**Financial**
```
F1 income: <1L 0.0 | 1–3L 0.33 | 3–5L 0.67 | 5–10L 0.85 | >10L 1.0
F2 sufficiency: surplus 1.0 | basics 0.5 | insufficient 0.0
F3 savings: yes 1.0 | limited 0.5 | none/debt 0.0
F4 diversity: ≥3 1.0 | 2 0.67 | 1 0.33 | 0 0.0
F6 seasonality: even 1.0 | ≥3 quarters 0.75 | 2q 0.5 | 1q 0.25
F7 shock (reverse): none 1.0 | once 0.5 | >once 0.0
F8 security: (x−1)/4
F9 scheme: using 1.0 | aware 0.5 | not-aware 0.0
F10 bank: yes 1.0 | no 0.0
```

**Emotional**
```
C1 state: fit 1.0 | stable 0.5 | challenges 0.0
C2 support (count of types): ≥3 1.0 | 2 0.75 | 1 0.5 | 0 0.0
C3 stress: low 1.0 | moderate 0.5 | high 0.0
C4 hope, C5 satisfaction: (x−1)/4
C6 isolation (reverse): (5−x)/4
(C7 substance use: NOT scored)
```

**Social**
```
D1 participation: regular 1.0 | occasional 0.5 | none 0.0
D2 trust, D5 intergenerational, D7 emergency support: (x−1)/4
D3 conflict: high-trust 1.0 | moderate 0.5 | frequent 0.0
D4 gender inclusion: equal 1.0 | partial 0.5 | exclusion 0.0
D6 institutions (count functioning): ≥2 1.0 | 1 0.5 | none 0.0
```

**Intellectual**
```
A13 education: Bachelor's+ 1.0 | Diploma/Higher-sec 0.75 | Secondary/Monastic/Vocational 0.5 | Primary 0.25 | none 0.0
G1 learning: active 1.0 | occasional 0.5 | none 0.0
G2 digital: confident 1.0 | some-difficulty 0.5 | no 0.0
G3 civic, G4 climate awareness: well 1.0 | partly 0.5 | not 0.0
G5 barriers (reverse, count): 0 → 1.0 | 1 → 0.67 | 2 → 0.33 | 3+ → 0.0
```
> Monastic & vocational education = 0.5 (not 0): non-formal education has genuine value, and monastic education is a major respected pathway in Ladakh.

**Spiritual**
```
H1 practice: daily 1.0 | weekly 0.67 | occasional 0.33 | never 0.0
H2 purpose, H3 ethics, H4 inner-peace: (x−1)/4
H5 worship access: in-vil 1.0 | <10km 0.67 | >10km 0.33 | seasonal 0.0
H6 festivals: regular 1.0 | occasional 0.5 | never 0.0
H7 cultural continuity (reverse): strongly-disagree 1.0 … strongly-agree 0.0
```

## D. Thresholds — Ladakh/India anchors (not Malaysia/Bhutan)

| Item | Anchor | Replaces |
|---|---|---|
| BMI | **ICMR / WHO Asia-Pacific** (18.5–22.9 normal) | Western 18.5–24.9 |
| Healthcare access | **IPHS hilly & tribal** facility norms | "1 clinic / 2,000" |
| Income bands | **₹** brackets, floor ≈ Ladakh minimum material needs | Malaysian RM |
| Schemes | MGNREGA, PM-KISAN, PMAY, livestock insurance | Malaysian schemes |
| Water quality | **BIS IS 10500** potable | generic |

## E. Overall score & reporting

```
Physical  = mean(B1,B2,B3,B4/5,B6,B7,B8,B11)
Financial = mean(F1,F2,F3,F4,F6,F7,F8,F9,F10)
Emotional = mean(C1,C2,C3,C4,C5,C6)
Social    = mean(D1,D2,D3,D4,D5,D6,D7)
Environmental = mean(B9/B10, E1/E1a, E3, E4, E5, E6)
Intellectual  = mean(A13, G1, G2, G3, G4, G5)
Spiritual = mean(H1,H2,H3,H4,H5,H6,H7)

IWB = mean(7 dimension scores)          # 0–1
```

**Reported on DYESKIT's familiar 1–7 band** (multiply IWB by 100):

| % | Likert | Band |
|---|---|---|
| 0–14 | 1 | Foundational Support Needed |
| 15–28 | 2 | Emerging Well-Being |
| 29–42 | 3 | Developing Well-Being |
| 43–56 | 4 | Basic Well-Being Achieved |
| 57–70 | 5 | Advancing Well-Being |
| 71–84 | 6 | Strong Well-Being |
| 85–100 | 7 | Thriving Well-Being |

**Village VWBI** = mean of valid household IWB scores in the village (report only if ≥ max(30% of households, 10) responded).

### Worked example
Physical items: `1.0, 0.5, 1.0, 0.625, 1.0, 0.67, 1.0, 0.5` → mean **0.79** → 79% → **Likert 6, Strong**.
If no BMI kit (B1 = NC): mean of the other 7 = **0.756** — the dimension still resolves; BMI simply doesn't count.

---

# PART 4 — Analysis & Reliability Guide

**Why this scoring is "reliable" (and how to demonstrate it):**

1. **Face/content validity** — every item maps to one named dimension and to a documented construct; thresholds cite external authorities (ICMR, IPHS, BIS, WHO), not arbitrary cut-offs.
2. **Internal consistency** — after the pilot, compute **Cronbach's α per dimension** on its constituent items. Target α ≥ 0.7. Emotional, Social, and Spiritual (multiple Likert items each) will report cleanly; Physical/Environmental mix item types, so also inspect item-total correlations and drop or revise any item correlating < 0.3.
3. **Graduated scoring** preserves variance (the core fix over the 3-point scale), which is a precondition for meaningful correlation, factor analysis, and year-on-year comparison.
4. **Missing-data rules are pre-specified** (§B), so scores are computed identically across enumerators — supporting inter-rater reliability. Add a **10% double-entry / re-interview check** to quantify it.
5. **Sensitivity** — for any borderline village (near a band boundary), report the score ± the effect of excluding the least-reliable item, so a single item can't flip the classification silently.

**Recommended analysis outputs per village:**
- Overall VWBI (0–1 and 1–7 band).
- 7-dimension **radar/spider chart** — the fastest read of strengths vs. gaps.
- Dimension-wise bar chart with the village mean vs. the survey-wide mean.
- Flag table: any dimension < 0.43 (below "Basic") = priority.
- Diagnostic: Digital Readiness (Section I) and development-priority ranking (I5), reported separately from the VWBI.

**Before fieldwork:** (1) populate A1/A2 dropdowns from the sampling frame; (2) calibrate the ₹ income floor to local cost of living; (3) pilot 10–15 households across 2–3 villages spanning altitude and the Leh/Kargil religious split; (4) run the α check and revise weak items before full rollout.

---

*Sections C7 (substance use) and I (technology) are diagnostic/sensitive and excluded from the wellbeing score by design. The instrument targets ~20–25 minutes; if field timing runs long, cut I4, E7, E2, G4 first — none is the sole anchor of a scored dimension.*
