# How DYESKIT scores well-being

Scoring version `v3-fixed-points` · questionnaire `v3.0`

*This file is generated from the scoring tables in `packages/core`. Do not edit it by hand —
change the tables and run `npm run docs:scoring`.*

## In one sentence

Every answer is worth **fixed points out of 100**; averages of those points give each dimension,
each household, and each village. There are no formulas anywhere — only look-up tables and averages.

## The five steps

1. **Each answer has fixed points.** Every scored question gives a set number of points from 0 to 100
   for the answer chosen. "Don't know" or "Prefer not to answer" gives **50** (the middle).
   A question that was skipped is simply left out.
2. **Dimension score = the average of its answered questions.** A dimension counts only if at least
   50% of its questions (and at least 2) were answered.
3. **Household score = the average of its seven dimension scores.** Every dimension weighs the same.
   A household gets a score only when at least 5 of the 7 dimensions count.
4. **The household score falls into one of seven bands** (table below).
5. **A village, a district, or any filtered group = the average of its household scores.**
   A village's result is called *reliable* once at least 30% of its households
   (and at least 10) have been surveyed.

## Worked example — the Financial dimension of one household

| Question | Answer | Points |
|---|---|---|
| F1 Income | ₹1–3 lakh | 25 |
| F2 Income covers needs | Basics only | 50 |
| F3 Savings / assets | None | 0 |
| F4 Income sources | 1 | 50 |
| F6 Income through the year | Two seasons | 50 |
| F7 Weather damage, 5 years | Once | 50 |
| F8 "I feel financially secure" | Agree | 75 |
| F9 Government schemes | Aware, not using | 50 |
| F10 Bank account | Yes | 100 |
| **Total** | | **450** |

450 points ÷ 9 questions = **50** → Financial score 50, band 4 ("Basic Well-Being Achieved").
The household score is then the average of this and the other six dimension scores.

## The seven bands

| Band | Score | Meaning |
|---|---|---|
| 1 | 0–14 | Foundational Support Needed |
| 2 | 15–28 | Emerging Well-Being |
| 3 | 29–42 | Developing Well-Being |
| 4 | 43–56 | Basic Well-Being Achieved |
| 5 | 57–70 | Advancing Well-Being |
| 6 | 71–84 | Strong Well-Being |
| 7 | 85–100 | Thriving Well-Being |

## Flags and warnings

- A **dimension** whose average is below **43** (below "Basic") is flagged; below **29** it is *critical*.
- A **warning sign** is a yes/no test on one household (for example "no bank account"). It is reported by the
  share of households where it applies: **critical** from 50%, **serious** from 30%, **watch** from 15%.

## What changed from the earlier method (v2)

Every rule that used a calculation now uses a fixed table:

| Before (v2) | Now (v3) |
|---|---|
| 1–5 agreement answers scored as (answer − 1) ÷ 4 | Fixed points 0 / 25 / 50 / 75 / 100 for each answer |
| Water reliability: 1 − (scarce months ÷ 12) | One question with fixed answers: reliable 100, 1–3 months 75, 4–6 months 50, 7+ months 25, severe 0 |
| Income spread: counted ticked quarters | One choice: even all year 100, three seasons 75, two 50, one 25 |
| Cooking fuel: average of all fuels used | The main fuel only, with fixed points |
| Healthcare distance and winter access averaged into one indicator | Two separate questions, each with fixed points |
| Income bands 0 / 0.33 / 0.67 / 0.85 / 1 | 0 / 25 / 50 / 75 / 100 |
| Education: primary 0.25 … | Same steps on the 0–100 scale |

## Every scored question and its points

### Physical

*Health, nutrition, sleep, sanitation and access to care.* 9 questions.

**B1 · Nutrition (BMI)** — Measured height & weight

| Answer | Points |
|---|---|
| BMI Healthy (18.5–22.9) | 100 |
| BMI Overweight (23.0–24.9) | 70 |
| BMI Mildly thin (17.0–18.4) | 60 |
| BMI Obese (25.0–29.9) | 40 |
| BMI Moderately thin (16.0–16.9) | 30 |
| BMI below 16.0, or 30.0 and above | 0 |

**B2 · Chronic illness** — Diagnosed chronic illness?

| Answer | Points |
|---|---|
| None | 100 |
| Managed with medication | 50 |
| Unmanaged or severe | 0 |
| Don't know | 50 |

**B3 · Altitude symptoms** — Altitude symptoms (breathlessness, chronic headache, fatigue)?

| Answer | Points |
|---|---|
| Never | 100 |
| Occasionally | 50 |
| Frequently | 0 |

**B4 · Distance to healthcare** — Nearest health facility you'd use

| Answer | Points |
|---|---|
| In the village | 100 |
| Regular mobile camp | 100 |
| 1–10 km | 75 |
| 11–20 km | 50 |
| More than 20 km | 0 |

**B5 · Winter access to care** — Last year, unable to reach care because of snow, road or distance?

| Answer | Points |
|---|---|
| Never | 100 |
| Once | 50 |
| More than once | 0 |

**B6 · Physical activity** — Typical daily physical activity

| Answer | Points |
|---|---|
| Active work (farming, herding, labour) | 100 |
| Moderate | 50 |
| Sedentary | 0 |

**B7 · Sleep** — Adequate sleep (about 7 hours) most nights?

| Answer | Points |
|---|---|
| Always | 100 |
| Mostly | 67 |
| Rarely | 33 |
| Never | 0 |

**B8 · Sanitation** — Household toilet

| Answer | Points |
|---|---|
| Toilet with proper waste disposal | 100 |
| Traditional dry-compost toilet | 100 |
| Toilet without proper disposal | 50 |
| No toilet | 0 |

**B11 · Self-rated health** — I am satisfied with my physical health.

| Answer | Points |
|---|---|
| Strongly disagree | 0 |
| Disagree | 25 |
| Neutral | 50 |
| Agree | 75 |
| Strongly agree | 100 |

### Financial

*Income, savings, livelihoods and security.* 9 questions.

**F1 · Income level** — Yearly household income (all sources)

| Answer | Points |
|---|---|
| Below ₹1 lakh | 0 |
| ₹1–3 lakh | 25 |
| ₹3–5 lakh | 50 |
| ₹5–10 lakh | 75 |
| Above ₹10 lakh | 100 |
| Prefer not to answer | 50 |

**F2 · Income sufficiency** — Does income cover needs through the year?

| Answer | Points |
|---|---|
| Covers needs, with some left over | 100 |
| Covers basics only | 50 |
| Does not cover | 0 |

**F3 · Savings / assets** — Savings or assets to fall back on?

| Answer | Points |
|---|---|
| Yes — savings, land, livestock or SHG | 100 |
| Limited | 50 |
| None, or in debt | 0 |

**F4 · Livelihood diversity** — Number of separate income sources

| Answer | Points |
|---|---|
| 0 income sources | 0 |
| 1 income sources | 50 |
| 2 income sources | 75 |
| 3 or more income sources | 100 |

**F6 · Income through the year** — How is the income spread over the year?

| Answer | Points |
|---|---|
| Evenly, all year round | 100 |
| Three seasons | 75 |
| Two seasons | 50 |
| One season only | 25 |

**F7 · Climate shocks** — Extreme-weather damage to crops, livestock or property in the last 5 years?

| Answer | Points |
|---|---|
| No | 100 |
| Once | 50 |
| More than once | 0 |

**F8 · Felt financial security** — I feel financially secure about my household's future.

| Answer | Points |
|---|---|
| Strongly disagree | 0 |
| Disagree | 25 |
| Neutral | 50 |
| Agree | 75 |
| Strongly agree | 100 |

**F9 · Government schemes** — Aware of / using a government livelihood scheme?

| Answer | Points |
|---|---|
| Aware and using one | 100 |
| Aware, not using | 50 |
| Not aware | 0 |

**F10 · Bank account** — Does the household have a bank account?

| Answer | Points |
|---|---|
| Yes | 100 |
| No | 0 |

### Emotional

*Mood, support, stress, hope and isolation.* 6 questions.

**C1 · Emotional state** — Overall, how do you feel emotionally?

| Answer | Points |
|---|---|
| Fit (calm, focused) | 100 |
| Generally stable | 50 |
| Facing challenges | 0 |
| Prefer not to answer | 50 |

**C2 · Support system** — What emotional support can you turn to?

| Answer | Points |
|---|---|
| 0 kinds of support ticked | 0 |
| 1 kinds of support ticked | 50 |
| 2 kinds of support ticked | 75 |
| 3 or more kinds of support ticked | 100 |

**C3 · Stress recovery** — How do you recover from stress?

| Answer | Points |
|---|---|
| Low stress, quick recovery | 100 |
| Moderate | 50 |
| High stress, hard to recover | 0 |
| Prefer not to answer | 50 |

**C4 · Hope** — In the last month I have felt hopeful about the future.

| Answer | Points |
|---|---|
| Strongly disagree | 0 |
| Disagree | 25 |
| Neutral | 50 |
| Agree | 75 |
| Strongly agree | 100 |

**C5 · Life satisfaction** — Overall, how satisfied are you with life?

| Answer | Points |
|---|---|
| Very dissatisfied | 0 |
| Dissatisfied | 25 |
| Neutral | 50 |
| Satisfied | 75 |
| Very satisfied | 100 |

**C6 · Winter isolation** — I feel isolated or cut off during the winter months.

| Answer | Points |
|---|---|
| Strongly disagree | 100 |
| Disagree | 75 |
| Neutral | 50 |
| Agree | 25 |
| Strongly agree | 0 |

### Social

*Trust, participation, inclusion and institutions.* 7 questions.

**D1 · Community participation** — Participation in community activities (festivals, meetings, collective labour)

| Answer | Points |
|---|---|
| Regular | 100 |
| Occasional | 50 |
| None | 0 |

**D2 · Trust** — I trust the people in my village.

| Answer | Points |
|---|---|
| Strongly disagree | 0 |
| Disagree | 25 |
| Neutral | 50 |
| Agree | 75 |
| Strongly agree | 100 |

**D3 · Conflict level** — Level of conflict or tension in the village

| Answer | Points |
|---|---|
| High trust, low conflict | 100 |
| Moderate | 50 |
| Frequent conflict | 0 |

**D4 · Inclusion** — Do women and marginalised groups take part equally in decisions?

| Answer | Points |
|---|---|
| Equally | 100 |
| Partly | 50 |
| Excluded | 0 |

**D5 · Between generations** — Elders are respected and youth are engaged in village life.

| Answer | Points |
|---|---|
| Strongly disagree | 0 |
| Disagree | 25 |
| Neutral | 50 |
| Agree | 75 |
| Strongly agree | 100 |

**D6 · Village institutions** — Which village institutions can you turn to?

| Answer | Points |
|---|---|
| 0 institutions ticked | 0 |
| 1 institutions ticked | 50 |
| 2 or more institutions ticked | 100 |

**D7 · Emergency support** — My community would help my household in an emergency.

| Answer | Points |
|---|---|
| Strongly disagree | 0 |
| Disagree | 25 |
| Neutral | 50 |
| Agree | 75 |
| Strongly agree | 100 |

### Environmental

*Water, food, waste, fuel and climate adaptation.* 6 questions.

**B10 · Drinking water quality** — Drinking water quality

| Answer | Points |
|---|---|
| Safe as it is | 100 |
| Needs boiling / filtering | 50 |
| Sometimes contaminated | 25 |
| Unsafe | 0 |
| Don't know | 50 |

**E1 · Water reliability** — Is your water supply reliable through the year?

| Answer | Points |
|---|---|
| Reliable all year | 100 |
| Scarce 1–3 months a year | 75 |
| Scarce 4–6 months a year | 50 |
| Scarce 7 months or more | 25 |
| Severe shortage or contamination | 0 |

**E3 · Local food** — Local or own-grown food vs packaged food

| Answer | Points |
|---|---|
| Mostly local | 100 |
| Mixed | 50 |
| Mostly packaged | 0 |

**E4 · Waste practice** — Household waste practice

| Answer | Points |
|---|---|
| Separated and disposed of | 100 |
| Partly managed | 50 |
| Burned | 25 |
| Dumped in the open | 0 |

**E5 · Cooking / heating fuel** — MAIN fuel for cooking and heating

| Answer | Points |
|---|---|
| Solar | 100 |
| Electricity | 100 |
| Biogas | 100 |
| LPG | 75 |
| Firewood | 25 |
| Dung cakes | 0 |
| Kerosene | 0 |

**E6 · Climate adaptation** — Climate / water adaptation measures adopted?

| Answer | Points |
|---|---|
| 0 measures ticked | 0 |
| 1 measures ticked | 50 |
| 2 or more measures ticked | 100 |

### Intellectual

*Education, learning, digital and civic awareness.* 6 questions.

**A13 · Education attained** — Highest education in the household

| Answer | Points |
|---|---|
| No formal education | 0 |
| Primary | 25 |
| Secondary | 50 |
| Higher secondary | 75 |
| Diploma | 75 |
| Bachelor's | 100 |
| Master's | 100 |
| Doctorate | 100 |
| Monastic | 50 |
| Vocational | 50 |
| Other | 50 |

**G1 · Active learning** — Is anyone currently learning a new skill or subject?

| Answer | Points |
|---|---|
| Actively | 100 |
| Occasionally | 50 |
| Not at all | 0 |

**G2 · Digital literacy** — Can you find and judge information using a phone, computer or the internet?

| Answer | Points |
|---|---|
| Confidently | 100 |
| With some difficulty | 50 |
| No | 0 |

**G3 · Civic awareness** — Aware of basic civic rights and entitlements?

| Answer | Points |
|---|---|
| Well aware | 100 |
| Partly | 50 |
| Not aware | 0 |

**G4 · Climate awareness** — Aware of climate change and its impact on Ladakh?

| Answer | Points |
|---|---|
| Well aware | 100 |
| Partly | 50 |
| Not aware | 0 |

**G5 · Education barriers** — Barriers to education in your household?

| Answer | Points |
|---|---|
| 0 barriers ticked (fewer is better) | 100 |
| 1 barriers ticked (fewer is better) | 67 |
| 2 barriers ticked (fewer is better) | 33 |
| 3 or more barriers ticked (fewer is better) | 0 |

### Spiritual

*Practice, purpose, peace, worship and culture.* 7 questions.

**H1 · Spiritual practice** — How regularly do you pray, meditate or do religious practice?

| Answer | Points |
|---|---|
| Daily | 100 |
| Weekly | 67 |
| Occasionally | 33 |
| Never | 0 |

**H2 · Sense of purpose** — I have a clear sense of purpose and direction.

| Answer | Points |
|---|---|
| Strongly disagree | 0 |
| Disagree | 25 |
| Neutral | 50 |
| Agree | 75 |
| Strongly agree | 100 |

**H3 · Ethical living** — My decisions are guided by ethical or spiritual values.

| Answer | Points |
|---|---|
| Strongly disagree | 0 |
| Disagree | 25 |
| Neutral | 50 |
| Agree | 75 |
| Strongly agree | 100 |

**H4 · Inner peace** — I generally feel inner peace and contentment.

| Answer | Points |
|---|---|
| Strongly disagree | 0 |
| Disagree | 25 |
| Neutral | 50 |
| Agree | 75 |
| Strongly agree | 100 |

**H5 · Access to worship** — Can you reach a monastery, mosque or place of worship when you wish?

| Answer | Points |
|---|---|
| Yes, in the village | 100 |
| Within 10 km | 67 |
| Beyond 10 km | 33 |
| Only in some seasons | 0 |

**H6 · Festivals** — Festival / cultural participation

| Answer | Points |
|---|---|
| Regular | 100 |
| Occasional | 50 |
| Never | 0 |

**H7 · Cultural continuity** — Are younger people losing interest in Ladakhi language, festivals and practices?

| Answer | Points |
|---|---|
| Strongly disagree | 100 |
| Disagree | 75 |
| Neutral | 50 |
| Agree | 25 |
| Strongly agree | 0 |


## Warning signs (insights)

| Sign | Dimension | Suggested action |
|---|---|---|
| Drinking water not safe as it is | Environmental | Test the sources, then prioritise treatment or a protected source. |
| Water scarce 4 months or more | Environmental | Storage capacity and ice-stupa or snowmelt harvesting are the usual first steps. |
| No climate or water adaptation measure | Environmental | A village-level demonstration of storage, greenhouse or trombe wall. |
| Main fuel is dung or kerosene | Environmental | Indoor air and fuel cost both improve with LPG or solar; check scheme eligibility. |
| Waste burned or dumped in the open | Environmental | A collection point and segregation; tourist-season volumes need separate handling. |
| Nearest health facility beyond 10 km | Physical | Mobile health camp scheduling, or a trained village health worker. |
| Could not reach care last year | Physical | Winter medicine stocking and an evacuation plan before the passes close. |
| Chronic illness not managed | Physical | Medicine supply and follow-up; check what is unavailable locally. |
| Frequent altitude symptoms | Physical | Screening at the next health camp; look for a pattern by altitude and age. |
| No toilet, or no proper disposal | Physical | Dry-compost toilets count as adequate; this signal leaves them out. |
| Income does not cover the year | Financial | Size the gap before designing support. |
| Income earned in one season only | Financial | Off-season work or storage-based income smooths the year. |
| No savings or assets, or in debt | Financial | SHG membership and a first savings product; debt needs separate handling. |
| No bank account | Financial | Blocks most government transfers — usually the cheapest thing to fix. |
| Unaware of livelihood schemes | Financial | A scheme camp in the village; awareness is the constraint, not eligibility. |
| Extreme-weather damage in the last 5 years | Financial | Livestock and crop insurance uptake; check what was damaged. |
| Facing emotional challenges | Emotional | Sensitive: report at village level only, and pair with support available. |
| No one to turn to for support | Emotional | Isolation risk, sharpest among elderly households and in winter. |
| High stress, hard to recover | Emotional | Look at what goes with it: income seasonality, isolation, health access. |
| Feels cut off in winter | Emotional | Connectivity and winter activities both matter. |
| No functioning village institution | Social | Nothing to build community action on — usually the first thing to rebuild. |
| Women or marginalised groups excluded | Social | Check who actually attends meetings, not only who is invited. |
| Young people left for work or study | Social | Not automatically bad — ask whether it reads as opportunity or loss. |
| Cannot use a phone or internet for information | Intellectual | Limits every digital service, including this one reaching them. |
| Two or more barriers to education | Intellectual | Distance, cost, winter closure and teacher absence need different responses. |
| Unaware of climate change impact | Intellectual | Matters here because adaptation depends on it. |
| Place of worship far or seasonal only | Spiritual | Access is partly a winter-road question. |
| Sees young people losing language and practices | Spiritual | Pairs with youth migration; a cultural programme is the usual response. |
