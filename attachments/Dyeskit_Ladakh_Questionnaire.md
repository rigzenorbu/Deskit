# Project DYESKIT — Village Well-Being Questionnaire (Ladakh)
### Adapted from the Bhutan Household Survey (GNH-style App Specification) for Ladakh, India

**Estimated administration time:** 20–25 minutes (interviewer-administered, household/individual level)
**Scale convention:** Unless otherwise noted, attitudinal items use a 5-point Likert scale:
`1 = Strongly Disagree | 2 = Disagree | 3 = Neutral | 4 = Agree | 5 = Strongly Agree`
**Source tags:** every question is tagged **[Adapted]** (kept, same substance), **[Modified]** (reworked for Ladakh), or **[New]** (not in the Bhutan source).

---

## How this questionnaire was built

The Bhutan source document I was given is not a short question list — it is a 117-page **mobile app data-entry specification** for an ongoing household registration/asset-tracking tool. It captures things like per-land-parcel geotags, per-house equipment inventories, per-crop input/output accounting, and an exhaustive 90-item chronic-disease dropdown. That level of granularity is appropriate for an administrative app, but not for a 20–25 minute wellness interview — so my adaptation process was:

1. **Extract every substantive question** from the Bhutan spec (registration, food/production, demographics, health & disability, mental & emotional well-being, skills, hobbies, aspirations, unfulfilled needs, wishes, landholding, housing, water, energy, mobility, forestry, business).
2. **Classify each** as Keep / Modify / Remove / Expand against Ladakh's context and Project DYESKIT's 7-dimension VWBI framework.
3. **Collapse app-level granularity** (e.g., per-parcel land records, per-house equipment checklists, 90-item disease dropdowns) into **survey-level indicator questions** that a respondent can answer in one sitting — this is the single biggest transformation, and is flagged throughout as **[Modified — condensed from app-level detail]**.
4. **Re-map everything** onto DYESKIT's seven dimensions (Physical, Financial, Emotional, Social, Environmental, Intellectual, Spiritual) plus the two extra sections your brief specifically requested (Demographics, and Technology/AI).

---

# SECTION A — Demographic Profile

| # | Question | Type | Response Options | Source |
|---|---|---|---|---|
| A1 | Name of respondent (optional / can be coded ID) | Open | Text | Adapted |
| A2 | Village | Dropdown | [Village list for survey area] | Adapted |
| A3 | Block / Tehsil | Dropdown | [Block list — Ladakh admin units] | New |
| A4 | District | Dropdown | Leh / Kargil | Modified (Bhutan had no district-level equivalent; Ladakh is a UT with 2 districts) |
| A5 | Years lived in this village | Numeric | ___ years | New |
| A6 | Age | Numeric | ___ years | Adapted |
| A7 | Gender | Single-select | Male / Female / Other / Prefer not to say | Adapted |
| A8 | Marital status | Single-select | Married / Single / Divorced / Separated / Widowed | Adapted (added "Widowed" — missing in source) |
| A9 | Household size (number of members) | Numeric | ___ members | Adapted |
| A10 | Type of family | Single-select | Nuclear / Joint / Extended | New (Bhutan spec tracked individual members but not family structure typology) |
| A11 | Religion | Single-select | Buddhist / Muslim / Hindu / Christian / Other / Prefer not to say | Modified (Bhutan context predominantly Buddhist/Hindu; Ladakh has a significant Buddhist–Muslim demographic split, especially Leh vs. Kargil) |
| A12 | Housing type | Single-select | Traditional Ladakhi stone/mud-brick house / Concrete-cement / Modern hybrid / Other | Modified (Bhutan's "Traditional Long House" replaced with Ladakhi vernacular housing types) |
| A13 | Highest education level (respondent) | Single-select | No formal education / Primary / Secondary / Higher secondary / Diploma / Bachelor's / Master's / Doctorate / Monastic education / Vocational-skill training / Other | Adapted |
| A14 | Primary occupation | Single-select | Farmer / Pastoralist (nomadic herding) / Tourism operator-guide / Handicraft artisan / Government employee / Teacher / Healthcare worker / Hospitality worker / Small business owner / Transport operator / Monk/Nun/Religious worker / Army/Defence-affiliated / Student / Homemaker / Other | Modified (removed Bhutan-specific roles like "Fisherman"; added "Army/Defence-affiliated," common in Ladakh's border economy, and "Pastoralist" reframed for Changpa/nomadic herding communities) |
| A15 | Yearly household income (range) | Single-select | <₹1 lakh / ₹1–3 lakh / ₹3–5 lakh / ₹5–10 lakh / >₹10 lakh | Modified (currency and brackets localized to India/Ladakh) |
| A16 | Household has a bank account | Yes/No | Yes / No | Adapted |
| A17 | Household has savings or investments | Yes/No | Yes / No | Adapted |

---

# SECTION B — Physical Wellness
*(Maps to DYESKIT Physical dimension: Nutritional BMI, Chronic/high-altitude illness, Access to healthcare, Physical activity)*

| # | Question | Type | Response Options | Source |
|---|---|---|---|---|
| B1 | Self-reported height and weight | Numeric | cm / kg (used to compute BMI) | Adapted |
| B2 | Dietary pattern | Single-select | Predominantly vegetarian / Predominantly non-veg / Balanced / Vegan / Other | Adapted |
| B3 | Do you have any diagnosed chronic illness? | Single-select | No chronic illness / Managed with medication / Unmanaged or severe | Modified — condensed from app-level detail (Bhutan's 90-item disease dropdown collapsed into the 3-tier adequacy scale DYESKIT already uses; a follow-up open text field captures the specific condition if the respondent wants to name it) |
| B3a | If yes, please specify condition (optional) | Open | Text | Modified |
| B4 | Do you or any household member experience symptoms of high-altitude illness (breathlessness, chronic headache, fatigue at altitude)? | Single-select | Never / Occasionally / Frequently | **New** — Ladakh-specific (Bhutan spec had no altitude-illness item; DYESKIT explicitly names high-altitude health as a priority) |
| B5 | Any household member with a disability (mobility, sensory, or other)? | Yes/No | Yes / No | Modified — condensed (Bhutan's 15-category motor-disability dropdown reduced to a screening item + optional detail) |
| B5a | If yes, briefly describe | Open | Text | Modified |
| B6 | Distance/access to nearest healthcare facility | Single-select | Health centre within village / Regular mobile health camp / Facility 10–20 km away / Facility beyond 20 km / Seasonal access only (cut off in winter) | Modified (added "seasonal access only," critical in Ladakh where snow cuts off villages for months — not applicable in Bhutan's source) |
| B7 | In the last year, were you or a household member unable to reach a hospital/health post due to road closure, weather, or distance? | Yes/No | Yes / No | **New** — Ladakh-specific winter-isolation indicator |
| B8 | Physical activity / functional ability | Single-select | Active daily physical work (farming, herding, walking, labour) / Moderate activity / Sedentary or physically restricted | Adapted |
| B9 | Do you get adequate sleep (7+ hours) most nights? | Single-select | Always / Mostly / Rarely / Never | New |
| B10 | Household sanitation facility | Single-select | Toilet with proper waste management / Toilet without proper disposal / No toilet (open) | Adapted |
| B11 | Do you engage in preventive healthcare (checkups, vaccination, health camps)? | Frequency | Regularly / Occasionally / Never | Adapted |
| B12 | Rate: "I am satisfied with my current physical health." | Likert (1–5) | 1–5 | New |
| B13 | Household drinking water source | Multi-select | Piped/tap supply / Stream or river / Glacier melt-fed channel / Spring / Groundwater/borewell / Rainwater / Water tanker | Modified (added glacier-melt as a distinct source — central to Ladakh's water security) |
| B14 | Drinking water quality | Single-select | Safe to drink directly / Needs boiling/filtration / Occasionally contaminated / Unsafe/contaminated | Adapted |

---

# SECTION C — Mental & Emotional Wellness
*(Maps to DYESKIT Emotional dimension: self-reported state, stress management, family/social support, substance dependence)*

This was one of the strongest, most directly transferable sections of the Bhutan tool — the underlying constructs (emotional state, coping, support systems, stress/resilience) travel well across contexts with light wording adjustments.

| # | Question | Type | Response Options | Source |
|---|---|---|---|---|
| C1 | Overall, how are you currently feeling emotionally? | Single-select | Mentally & emotionally fit (calm, focused, able to express emotions) / Generally stable (minor stress, usually manageable) / Facing challenges (frequent stress/anxiety, difficulty coping) / Prefer not to answer | Adapted |
| C2 | Do you talk about your feelings with others? | Single-select | Regularly / Occasionally / Rarely / Prefer not to answer | Adapted |
| C3 | What kind of emotional support do you have access to? | Multi-select | Family/friends / Professional support (counselling) / Religious/spiritual community / Personal coping strategies (prayer, walking, art, hobbies) / None | Modified (added "religious/spiritual community" as a distinct, locally salient support channel alongside family and professional support) |
| C4 | How do you manage and recover from stress? | Single-select | Low stress, quick recovery / Moderate stress, moderate recovery / High stress, difficulty recovering / Prefer not to answer | Adapted |
| C5 | Rate: "In the last month, I have felt hopeful about the future." | Likert (1–5) | 1–5 | New |
| C6 | Rate: "I feel isolated or cut off, especially during winter months." | Likert (1–5) | 1–5 | **New** — Ladakh-specific (seasonal road closures and long winters create a distinct isolation risk not present in the Bhutan context as framed) |
| C7 | Do you or household members use any of the following regularly? | Multi-select | Tobacco / Alcohol / Local brew (chhang, etc.) / None / Prefer not to answer | Modified (localized substance list; retained as sensitive item with opt-out) |
| C8 | How would you rate your overall life satisfaction? | Likert (1–5) | 1 = Very dissatisfied → 5 = Very satisfied | New |
| C9 | Has migration of family members (for work/study) affected your household's emotional well-being? | Single-select | Not applicable, no one has migrated / Yes, positively (opportunity, income) / Yes, negatively (loneliness, loss of support) / Mixed | **New** — Ladakh/Himalayan youth-outmigration is a named DYESKIT concern |

---

# SECTION D — Social Wellness
*(Maps to DYESKIT Social dimension: community participation, social trust, gender/inclusion, inter-generational bonding)*

| # | Question | Type | Response Options | Source |
|---|---|---|---|---|
| D1 | Participation in community activities (festivals, village meetings, religious events) | Frequency | Regular / Occasional / None | Adapted |
| D2 | Rate: "I trust the people in my village/community." | Likert (1–5) | 1–5 | Adapted |
| D3 | How would you describe the level of conflict or tension in your community? | Single-select | High trust, low conflict / Moderate trust / Frequent conflict or insecurity | Adapted |
| D4 | Do women and marginalized groups participate equally in community decisions? | Single-select | Equal participation / Partial inclusion / Exclusion or discrimination | Adapted |
| D5 | Rate: "Elders are respected and youth are actively engaged in community life." | Likert (1–5) | 1–5 | Adapted |
| D6 | Is there a functioning village-level institution (Gram Sabha, Village Committee, LAHDC-linked body, monastery committee) that residents can turn to? | Yes/No + detail | Yes (specify) / No | **New** — Ladakh's local governance structures (LAHDC, Village Committees, monastic institutions) differ from Bhutan's administrative setup |
| D7 | Rate: "Women in my household/community have a say in major household or community decisions." | Likert (1–5) | 1–5 | New — women's empowerment named DYESKIT priority |
| D8 | Have young people from your household left the village for work or study in the last 3 years? | Yes/No + count | Yes (how many: ___) / No | **New** — Ladakh youth-migration indicator |
| D9 | Rate: "My community supports elderly members who live alone or need care." | Likert (1–5) | 1–5 | New |
| D10 | Rate: "I feel my community would help me in an emergency (illness, natural disaster, financial crisis)." | Likert (1–5) | 1–5 | New |

---

# SECTION E — Environmental Wellness
*(Maps to DYESKIT Environmental dimension: water security, waste/sanitation, local food quality, climate resilience)*

| # | Question | Type | Response Options | Source |
|---|---|---|---|---|
| E1 | Is your household's water supply reliable year-round? | Single-select | Reliable year-round / Seasonal scarcity / Severe shortage or contamination | Adapted |
| E2 | Have you noticed changes in glacier melt, snowfall, or stream flow over the last 10 years? | Single-select | Significant decrease / Some decrease / No noticeable change / Increase | **New** — Ladakh's water security is glacier-dependent; this has no equivalent in the Bhutan tool |
| E3 | Household waste management practice | Single-select | Segregation + proper disposal / Partial management / Open dumping | Adapted |
| E4 | Wastewater disposal method | Single-select | Septic tank / Discharged into soil / Discharged into stream/river / Connected to treatment system | Adapted |
| E5 | How often do you consume locally grown/organic food vs. packaged food? | Single-select | Mostly local/organic / Mixed local and packaged / Mostly packaged | Adapted |
| E6 | Household's main cooking/heating fuel(s) | Multi-select | LPG / Firewood / Dung cakes / Kerosene / Solar / Electricity / Biogas | Modified (retained Bhutan's fuel categories; solar weighted higher given Ladakh's solar potential) |
| E7 | Does your household or village use any renewable energy source? | Multi-select | Solar (individual/household) / Solar (village micro-grid) / Micro-hydro / None | Modified — condensed from app-level micro-grid tracking into a household-relevant item |
| E8 | Rate: "Climate change (erratic rainfall, glacial melt, temperature shifts) is already affecting my livelihood or daily life." | Likert (1–5) | 1–5 | Modified (Bhutan source had general "environmental aspiration" items; made explicit and measurable for Ladakh) |
| E9 | Has your village adopted any water conservation or climate adaptation practice (rainwater harvesting, water storage/"artificial glaciers," eco-housing, afforestation)? | Yes/No + detail | Yes (specify) / No | Modified (Bhutan's climate-resilience item generalized; Ladakh-specific practices like ice stupas/artificial glaciers explicitly prompted) |
| E10 | Rate: "I am concerned about the growing volume of tourist-related waste in/near my village." | Likert (1–5) | 1–5 | **New** — tourism-driven waste is a named Ladakh pressure absent from the Bhutan tool |
| E11 | Rate: "I am aware of practical steps I can take to protect the local environment." | Likert (1–5) | 1–5 | New |

---

# SECTION F — Economic & Occupational Wellness
*(Maps to DYESKIT Financial dimension: income stability, sufficiency, savings/assets, livelihood diversity)*

| # | Question | Type | Response Options | Source |
|---|---|---|---|---|
| F1 | Primary source of household income | Single-select | Stable (govt job, pension, established tourism business, farming+livestock) / Seasonal or irregular / No stable income | Adapted |
| F2 | Does your household income meet your needs year-round? | Single-select | Meets needs with a buffer / Meets basic needs, no buffer / Insufficient | Adapted |
| F3 | Household savings/assets | Single-select | Savings, land, livestock, or SHG membership / Limited savings or assets / None / In debt | Adapted |
| F4 | Number of distinct income sources in the household | Single-select | More than one / Single source / No clear source | Adapted |
| F5 | Does your household depend on tourism-related income (guiding, homestay, transport, handicraft sales)? | Yes/No + detail | Yes (specify role) / No | **New** — sustainable tourism is a named DYESKIT priority not present in the Bhutan source |
| F6 | Rate: "Tourism has been beneficial for my household's income." | Likert (1–5) | 1–5 | New |
| F7 | Rate: "Tourism has created problems for my village (water stress, waste, price rise, loss of culture)." | Likert (1–5) | 1–5 | New |
| F8 | Is your household engaged in traditional livelihood activities (pashmina/livestock rearing, subsistence farming, handicrafts)? | Multi-select | Livestock/pashmina rearing / Subsistence farming / Handicrafts / Traditional trade / None | Modified — condensed from Bhutan's detailed per-crop/per-livestock accounting into a household-level screening item |
| F9 | Are you aware of and using any government scheme for livelihood support (e.g., MGNREGA, PM-KISAN, livestock insurance, tourism/homestay schemes)? | Multi-select | Aware and using / Aware, not using / Not aware | Modified (localized to Indian/Ladakh UT government schemes) |
| F10 | Rate: "I feel financially secure about my household's future." | Likert (1–5) | 1–5 | New |
| F11 | Has extreme weather or a natural event (flash flood, landslide, drought, unseasonal snow) damaged your crops, livestock, or property in the last 5 years? | Yes/No + detail | Yes (specify) / No | **New** — climate-linked livelihood shock indicator |
| F12 | Would you or a household member be interested in new livelihood opportunities (eco-tourism, organic farming, handicraft enterprise, solar-based enterprise)? | Multi-select | Yes — specify area(s) / Not interested | New |

---

# SECTION G — Intellectual Wellness
*(Maps to DYESKIT Intellectual dimension: education, continuous learning, digital/media literacy, civic awareness)*

| # | Question | Type | Response Options | Source |
|---|---|---|---|---|
| G1 | Highest education level achieved (household reference, if different from A13) | Single-select | Same categories as A13 | Adapted |
| G2 | Are you currently learning any new skill or subject? | Frequency | Actively learning / Occasional learning / No learning engagement | Adapted |
| G3 | What skills would you or your household like to learn? | Multi-select | Digital/computer literacy / Organic farming / Tourism & hospitality management / Handicraft techniques / Financial literacy / English language / Vocational/technical trade / Other | Modified — condensed from Bhutan's long multi-tier skills taxonomy into a shorter, Ladakh-relevant list |
| G4 | Can you access and evaluate information using a smartphone/computer/internet? | Single-select | Yes, confidently / Yes, with some difficulty / No | Adapted |
| G5 | Are you aware of your basic civic rights, entitlements, and duties (e.g., voting, local governance, land rights)? | Single-select | Well aware / Partially aware / Not aware | Adapted |
| G6 | Are you aware of climate change and its likely impact on Ladakh? | Single-select | Well aware / Partially aware / Not aware | Modified (Bhutan item was general "environmental awareness"; made climate-specific per DYESKIT priorities) |
| G7 | Rate: "Schools/educational facilities near my village are adequate." | Likert (1–5) | 1–5 | New |
| G8 | Does your household face barriers to children's/adult's education (distance, cost, seasonal closure, lack of teachers)? | Multi-select | Distance / Cost / Seasonal/weather closure / Lack of teachers / No barriers | Modified (added "seasonal/weather closure" — relevant to Ladakh's high-altitude school calendars) |

---

# SECTION H — Spiritual & Cultural Wellness
*(Maps to DYESKIT Spiritual dimension: spiritual practice, sense of purpose, ethical living, inner peace/contentment)*

| # | Question | Type | Response Options | Source |
|---|---|---|---|---|
| H1 | How regularly do you engage in prayer, meditation, or religious/spiritual ritual? | Frequency | Regular / Occasional / None | Adapted |
| H2 | Rate: "I have a strong sense of purpose and direction in my life." | Likert (1–5) | 1–5 | Adapted |
| H3 | Rate: "My decisions are guided by ethical or spiritual values." | Likert (1–5) | 1–5 | Adapted |
| H4 | Rate: "I generally feel a sense of inner peace and contentment." | Likert (1–5) | 1–5 | Adapted |
| H5 | Do you have access to a monastery, mosque, or other place of worship/community gathering within reasonable distance? | Single-select | Within village / Within 10 km / Beyond 10 km / Seasonal access only | Modified — condensed from Bhutan's general "spiritual aspiration" list into a concrete access item, adapted to Ladakh's Buddhist-monastery/Muslim-mosque religious landscape |
| H6 | Rate: "Traditional Ladakhi culture, language, and festivals are being well preserved in my village." | Likert (1–5) | 1–5 | **New** — cultural preservation named as a DYESKIT priority |
| H7 | Do you feel younger generations are losing interest in traditional Ladakhi practices, language, or festivals? | Single-select | Strongly agree / Agree / Neutral / Disagree / Strongly disagree | New |
| H8 | Do you participate in or support local festivals/cultural events (e.g., Losar, Hemis festival, village archery, local monastic events)? | Frequency | Regularly / Occasionally / Never | Modified (localized festival examples) |
| H9 | Rate: "I would like more support for preserving Ladakhi language, art, and spiritual practices." | Likert (1–5) | 1–5 | New |

---

# SECTION I — Technology, AI & Future Village Development

This section did not exist in the Bhutan source in any meaningful form (the source app spec is itself a data-collection tool, not a section *about* AI attitudes) — it is almost entirely **[New]**, built directly from Project DYESKIT's AI-enabled dashboard and chatbot concept.

| # | Question | Type | Response Options | Source |
|---|---|---|---|---|
| I1 | Do you own a smartphone? | Yes/No | Yes / No | New |
| I2 | Household internet access | Single-select | Reliable broadband/4G-5G / Intermittent mobile data / No internet access | New |
| I3 | Have you heard of "Artificial Intelligence" (AI) or used an AI-based tool/app (e.g., chatbot, voice assistant)? | Single-select | Yes, and I use it / Yes, but I don't use it / No, never heard of it | New |
| I4 | Rate: "I would trust an AI-based tool to answer questions about my village's services (water, healthcare, schemes)." | Likert (1–5) | 1–5 | New |
| I5 | Would you be willing to use an AI/chatbot tool for any of the following? | Multi-select | Healthcare information / Education/learning support / Agriculture/livestock advice / Tourism/business support / Village service information (schemes, water, electricity) / Not interested in any | New |
| I6 | What is the biggest barrier to using digital/AI tools in your household? | Single-select | No smartphone/device / No internet / Cost / Lack of digital skills / Language barrier (not in local language) / No barrier | New |
| I7 | Would you prefer such tools to be available in Ladakhi/Bhoti or local dialect rather than only English/Hindi? | Yes/No | Yes / No / No preference | New |
| I8 | Rank your village's top development priorities (rank top 3) | Ranking | Water security / Healthcare access / Roads & connectivity / Education / Employment/livelihood / Renewable energy / Waste management / Tourism management / Cultural preservation / Digital connectivity | New |
| I9 | Rate: "I believe technology (including AI) can genuinely help improve life in my village." | Likert (1–5) | 1–5 | New |

---

# SPSS Coding Table (Variable Reference)

| Q.ID | Variable Name | Variable Label | Type | Coding | Dimension |
|---|---|---|---|---|---|
| A2 | vil_name | Village | String/Categorical | Numeric code per village list | Demographic |
| A3 | block_name | Block/Tehsil | Categorical | Numeric code per block list | Demographic |
| A4 | district | District | Categorical | 1=Leh, 2=Kargil | Demographic |
| A5 | yrs_village | Years lived in village | Numeric | Continuous (years) | Demographic |
| A6 | age | Age | Numeric | Continuous (years) | Demographic |
| A7 | gender | Gender | Categorical | 1=Male, 2=Female, 3=Other, 9=Prefer not to say | Demographic |
| A8 | marital | Marital status | Categorical | 1=Married, 2=Single, 3=Divorced, 4=Separated, 5=Widowed | Demographic |
| A9 | hh_size | Household size | Numeric | Continuous | Demographic |
| A10 | family_type | Type of family | Categorical | 1=Nuclear, 2=Joint, 3=Extended | Demographic |
| A11 | religion | Religion | Categorical | 1=Buddhist, 2=Muslim, 3=Hindu, 4=Christian, 5=Other, 9=Prefer not to say | Demographic |
| A12 | housing_type | Housing type | Categorical | 1=Traditional, 2=Concrete, 3=Hybrid, 4=Other | Demographic |
| A13 | education | Education level | Ordinal | 0=None…8=Doctorate (10-pt scale, see codebook) | Demographic/Intellectual |
| A14 | occupation | Primary occupation | Categorical | 1–15 per option list, 16=Other | Demographic/Financial |
| A15 | income_band | Yearly HH income band | Ordinal | 1=<1L, 2=1–3L, 3=3–5L, 4=5–10L, 5=>10L | Demographic/Financial |
| A16 | bank_acct | Bank account | Binary | 1=Yes, 0=No | Demographic/Financial |
| A17 | savings | Savings/investments | Binary | 1=Yes, 0=No | Demographic/Financial |
| B1 | bmi | Nutritional status (BMI-derived) | Computed | 1=Normal(Adequate)=1pt, 0.5=Mild under/over, 0=Severe | Physical |
| B3 | chronic_ill | Chronic illness status | Ordinal | 1=None(1pt), 0.5=Managed, 0=Unmanaged | Physical |
| B4 | altitude_sympt | High-altitude illness symptoms | Ordinal | 1=Never, 2=Occasionally, 3=Frequently | Physical |
| B5 | disability | Disability in household | Binary | 1=Yes, 0=No | Physical |
| B6 | health_access | Healthcare access | Ordinal | 1=In village(1pt), 2=10–20km(0.5pt), 3=Beyond 20km/seasonal(0pt) | Physical |
| B7 | health_cutoff | Unable to reach healthcare (weather/road) | Binary | 1=Yes, 0=No | Physical |
| B8 | phys_activity | Physical activity level | Ordinal | 1=Active(1pt), 2=Moderate(0.5pt), 3=Sedentary(0pt) | Physical |
| B10 | sanitation | Sanitation facility | Ordinal | 1=Proper, 2=Partial, 3=None | Physical/Environmental |
| B12 | phys_satisf | Physical health satisfaction | Likert | 1–5 | Physical |
| B13 | water_source | Drinking water source | Multi-binary | 1=Yes/0=No per source (7 dummy vars) | Physical/Environmental |
| B14 | water_qual | Drinking water quality | Ordinal | 1=Safe(1pt), 2=Needs treatment(0.5pt), 3=Unsafe(0pt) | Physical/Environmental |
| C1 | emo_state | Overall emotional state | Ordinal | 1=Fit(1pt), 2=Stable(0.5pt), 3=Challenges(0pt), 9=PNA | Emotional |
| C2 | emo_comm | Talks about feelings | Ordinal | 1=Regularly, 2=Occasionally, 3=Rarely, 9=PNA | Emotional |
| C3 | emo_support | Support system type | Multi-binary | 1=Yes/0=No per option (5 dummy vars) | Emotional |
| C4 | stress_res | Stress & resilience | Ordinal | 1=Low stress(1pt), 2=Moderate(0.5pt), 3=High(0pt), 9=PNA | Emotional |
| C5 | hopeful | Hopeful about future | Likert | 1–5 | Emotional |
| C6 | winter_isolation | Winter isolation | Likert | 1–5 | Emotional |
| C7 | substance_use | Substance use | Multi-binary | 1=Yes/0=No per substance | Emotional |
| C8 | life_satisf | Life satisfaction | Likert | 1–5 | Emotional |
| C9 | migration_impact | Migration's emotional impact | Categorical | 1=N/A, 2=Positive, 3=Negative, 4=Mixed | Emotional/Social |
| D1 | comm_particip | Community participation | Ordinal | 1=Regular(1pt), 2=Occasional(0.5pt), 3=None(0pt) | Social |
| D2 | trust | Trust in community | Likert | 1–5 | Social |
| D3 | conflict_level | Conflict/tension level | Ordinal | 1=High trust(1pt), 2=Moderate(0.5pt), 3=Frequent conflict(0pt) | Social |
| D4 | gender_incl | Gender/social inclusion | Ordinal | 1=Equal(1pt), 2=Partial(0.5pt), 3=Exclusion(0pt) | Social |
| D5 | intergen_bond | Intergenerational bonding | Likert | 1–5 | Social |
| D6 | local_inst | Functioning local institution present | Binary | 1=Yes, 0=No | Social |
| D7 | women_voice | Women's voice in decisions | Likert | 1–5 | Social |
| D8 | youth_migration | Youth migrated (count) | Numeric | Continuous (count) | Social |
| D9 | elder_support | Community support for elderly | Likert | 1–5 | Social |
| D10 | emergency_support | Perceived community emergency support | Likert | 1–5 | Social |
| E1 | water_security | Water security | Ordinal | 1=Reliable(1pt), 2=Seasonal(0.5pt), 3=Severe(0pt) | Environmental |
| E2 | glacier_change | Perceived glacier/snowfall change | Ordinal | 1=Sig. decrease…4=Increase | Environmental |
| E3 | waste_mgmt | Waste management practice | Ordinal | 1=Proper(1pt), 2=Partial(0.5pt), 3=Open dumping(0pt) | Environmental |
| E4 | wastewater | Wastewater disposal method | Categorical | 1=Septic, 2=Soil, 3=River, 4=Treatment system | Environmental |
| E5 | food_quality | Local vs. packaged food | Ordinal | 1=Local(1pt), 2=Mixed(0.5pt), 3=Packaged(0pt) | Environmental |
| E6 | fuel_type | Cooking/heating fuel | Multi-binary | 1=Yes/0=No per fuel type | Environmental |
| E7 | renewable_energy | Renewable energy use | Multi-binary | 1=Yes/0=No per source | Environmental |
| E8 | climate_impact | Climate change impact perception | Likert | 1–5 | Environmental |
| E9 | climate_adapt | Climate adaptation practice adopted | Binary | 1=Yes, 0=No | Environmental |
| E10 | tourism_waste | Tourism waste concern | Likert | 1–5 | Environmental |
| E11 | env_awareness | Environmental action awareness | Likert | 1–5 | Environmental/Intellectual |
| F1 | income_source | Primary income source stability | Ordinal | 1=Stable(1pt), 2=Seasonal(0.5pt), 3=None(0pt) | Financial |
| F2 | income_suff | Income sufficiency | Ordinal | 1=Buffer(1pt), 2=Basic(0.5pt), 3=Insufficient(0pt) | Financial |
| F3 | savings_assets | Savings/assets | Ordinal | 1=Yes(1pt), 2=Limited(0.5pt), 3=None/debt(0pt) | Financial |
| F4 | livelihood_div | Livelihood diversity | Ordinal | 1=Multiple(1pt), 2=Single(0.5pt), 3=None(0pt) | Financial |
| F5 | tourism_dep | Tourism income dependence | Binary | 1=Yes, 0=No | Financial |
| F6 | tourism_benefit | Tourism perceived benefit | Likert | 1–5 | Financial |
| F7 | tourism_problem | Tourism perceived problems | Likert | 1–5 | Financial/Environmental |
| F8 | trad_livelihood | Traditional livelihood engagement | Multi-binary | 1=Yes/0=No per category | Financial |
| F9 | govt_scheme | Govt. scheme awareness/use | Ordinal | 1=Using, 2=Aware not using, 3=Not aware | Financial |
| F10 | fin_security | Financial security perception | Likert | 1–5 | Financial |
| F11 | climate_shock | Climate-linked livelihood shock | Binary | 1=Yes, 0=No | Financial/Environmental |
| F12 | new_livelihood_int | Interest in new livelihoods | Multi-binary | 1=Yes/0=No per area | Financial |
| G2 | continuous_learn | Continuous learning | Ordinal | 1=Active(1pt), 2=Occasional(0.5pt), 3=None(0pt) | Intellectual |
| G3 | skill_interest | Skills wanted | Multi-binary | 1=Yes/0=No per skill | Intellectual |
| G4 | digital_literacy | Digital/media literacy | Ordinal | 1=Confident(1pt), 2=Some difficulty(0.5pt), 3=No(0pt) | Intellectual |
| G5 | civic_awareness | Civic rights awareness | Ordinal | 1=Well aware(1pt), 2=Partial(0.5pt), 3=Not aware(0pt) | Intellectual |
| G6 | climate_awareness | Climate change awareness | Ordinal | 1=Well aware, 2=Partial, 3=Not aware | Intellectual/Environmental |
| G7 | school_adequacy | School adequacy perception | Likert | 1–5 | Intellectual |
| G8 | edu_barriers | Education barriers | Multi-binary | 1=Yes/0=No per barrier | Intellectual |
| H1 | spiritual_practice | Spiritual practice frequency | Ordinal | 1=Regular(1pt), 2=Occasional(0.5pt), 3=None(0pt) | Spiritual |
| H2 | life_purpose | Sense of purpose | Likert | 1–5 | Spiritual |
| H3 | ethical_living | Ethical/values-guided decisions | Likert | 1–5 | Spiritual |
| H4 | inner_peace | Inner peace/contentment | Likert | 1–5 | Spiritual |
| H5 | worship_access | Access to place of worship | Ordinal | 1=In village, 2=Within 10km, 3=Beyond 10km, 4=Seasonal only | Spiritual |
| H6 | culture_preserv | Cultural preservation perception | Likert | 1–5 | Spiritual |
| H7 | youth_culture_loss | Perceived youth disengagement from culture | Ordinal | 1=Strongly agree…5=Strongly disagree | Spiritual/Social |
| H8 | festival_particip | Festival/cultural participation | Ordinal | 1=Regular, 2=Occasional, 3=Never | Spiritual |
| H9 | culture_support_want | Desire for cultural preservation support | Likert | 1–5 | Spiritual |
| I1 | smartphone_own | Smartphone ownership | Binary | 1=Yes, 0=No | Technology |
| I2 | internet_access | Internet access | Ordinal | 1=Reliable, 2=Intermittent, 3=None | Technology |
| I3 | ai_awareness | AI awareness/use | Ordinal | 1=Uses it, 2=Aware not using, 3=Never heard | Technology |
| I4 | ai_trust | Trust in AI for village services | Likert | 1–5 | Technology |
| I5 | ai_willingness | Willingness to use AI (by domain) | Multi-binary | 1=Yes/0=No per domain | Technology |
| I6 | digital_barrier | Biggest digital/AI barrier | Categorical | 1–6 per option list | Technology |
| I7 | language_pref | Local language interface preference | Categorical | 1=Yes, 2=No, 3=No preference | Technology |
| I8 | dev_priority | Village development priority ranking | Ranking | Rank 1–3 assigned per option (10 dummy rank vars) | Technology/Cross-cutting |
| I9 | tech_optimism | Belief technology can help village | Likert | 1–5 | Technology |

*PNA = Prefer Not to Answer (coded as system-missing or 9, per analyst preference)*

---

# Dimension Mapping Summary

| Dyeskit Dimension | Questionnaire Section(s) | Approx. Item Count |
|---|---|---|
| Physical | B1–B14 | 14 |
| Financial (Economic & Occupational) | F1–F12 (+ A14, A15) | 14 |
| Emotional (Mental & Emotional) | C1–C9 | 9 |
| Social | D1–D10 | 10 |
| Environmental | E1–E11 | 11 |
| Intellectual | G1–G8 | 8 |
| Spiritual (& Cultural) | H1–H9 | 9 |
| Demographic (context, not scored) | A1–A17 | 17 |
| Technology/AI (cross-cutting, informs future dashboard design; not part of the core 7-dimension VWBI score) | I1–I9 | 9 |

**Total core items:** ~101 (excluding open-text follow-ups), consistent with a 20–25 minute interview.

Note on scoring alignment: Sections B, C, D, E, F, G, H each contain **4 indicator-anchor questions** that map directly onto DYESKIT's existing 28-indicator/7-dimension VWBI adequacy scale (1 / 0.5 / 0 scoring) — these are marked in the SPSS table with "(1pt)/(0.5pt)/(0pt)" coding so they can feed the VWBI formula without modification. The remaining items are **contextual, diagnostic, and Ladakh-specific additions** that enrich the qualitative/interpretive layer (SWOT, AI dashboard narratives) without disrupting the core scoring model.

---

# Review: Gaps and Recommendations

**1. Village/Block sampling frame not yet defined.**
A2/A3 assume a village and block list will be supplied by the DYESKIT team before fieldwork; these should be pre-populated as dropdowns rather than open text to keep coding clean.

**2. High-altitude and seasonal-access items are new and unvalidated.**
B4, B7, C6, G8 (seasonal closure) are newly written for this context and haven't been field-tested. Recommend a small pilot (10–15 respondents across 2–3 villages spanning different altitudes) before full rollout, to check comprehension and response distribution.

**3. Religious/cultural sensitivity in Leh vs. Kargil.**
A11 (religion) and Section H items should be piloted separately in Buddhist-majority and Muslim-majority villages; H5 (worship access) and H8 (festival examples) may need village-specific wording (e.g., referencing Islamic festivals in Kargil rather than only Losar/Hemis).

**4. Substance-use item (C7) needs careful field protocol.**
Even with a "prefer not to answer" option, self-reported substance use is sensitive. Recommend interviewer training on neutral tone and, if possible, self-administration (respondent marks the answer privately) for this item specifically.

**5. Multi-select and ranking items will need careful SPSS structuring.**
Several items (B13, C3, C7, E6, E7, F8, F9, F12, G3, G8, I5) are multi-select, which typically require conversion into separate dummy variables during data entry — this is noted in the coding table but should be built into the data-entry app/form now, not retrofitted later.

**6. No explicit water-conflict or resource-dispute item.**
Given documented tensions over water allocation between agricultural and tourism uses in parts of Ladakh, consider adding one item under Environmental or Social wellness in a future revision (e.g., "Has there been conflict or disagreement in your village over water allocation in the last 3 years?").

**7. Length check.**
At ~101 items with several multi-select/ranking questions, actual administration time may run closer to 25–30 minutes for less literate or elderly respondents. Consider a "core" vs. "extended" module split if time becomes a constraint in the field — Sections A, B, C, D, F, I as core; E, G, H as extended (or vice versa depending on DYESKIT's analytical priorities).

**8. AI/Technology section is untested against actual dashboard design.**
Section I was built from the proposal's description of the planned chatbot/dashboard rather than a working prototype. Once the DYESKIT AI dashboard mock-up is further along, I5 and I6 in particular should be revisited to ensure they map to real, buildable features rather than aspirational ones.

**9. No explicit consent/ethics preamble included.**
This questionnaire assumes a standard consent script (purpose, confidentiality, right to skip/withdraw) precedes Section A — not included here as it wasn't part of either source document, but should be added before fieldwork, especially given the sensitive items in Sections C and H.
