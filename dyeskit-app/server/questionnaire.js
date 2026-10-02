'use strict';
/**
 * DYESKIT Ladakh Village Well-Being Questionnaire — v2.0
 * Single source of truth for: form rendering (client) and scoring (server).
 *
 * Item types: single | multi | number | likert | likert_rev | text | measure
 * `dim`  = scored dimension id (null = context / diagnostic, not scored)
 * `pts`  = score contribution 0..1 for that option (omitted => not scored)
 * `rule` = named rule in scoring.js for items that are not simple option lookups
 */

const { DISTRICTS } = require('./villages');

const QUESTIONNAIRE_VERSION = 'v2.0';

const DIMENSIONS = [
  { id: 'phy', name: 'Physical', short: 'Phy' },
  { id: 'fin', name: 'Financial', short: 'Fin' },
  { id: 'emo', name: 'Emotional', short: 'Emo' },
  { id: 'soc', name: 'Social', short: 'Soc' },
  { id: 'env', name: 'Environmental', short: 'Env' },
  { id: 'int', name: 'Intellectual', short: 'Int' },
  { id: 'spi', name: 'Spiritual', short: 'Spi' },
];

const BANDS = [
  { band: 1, min: 0, max: 14.999, label: 'Foundational Support Needed' },
  { band: 2, min: 15, max: 28.999, label: 'Emerging Well-Being' },
  { band: 3, min: 29, max: 42.999, label: 'Developing Well-Being' },
  { band: 4, min: 43, max: 56.999, label: 'Basic Well-Being Achieved' },
  { band: 5, min: 57, max: 70.999, label: 'Advancing Well-Being' },
  { band: 6, min: 71, max: 84.999, label: 'Strong Well-Being' },
  { band: 7, min: 85, max: 100, label: 'Thriving Well-Being' },
];

const PNA = { v: 'PNA', label: 'Prefer not to answer', pna: true };
const DK = { v: 'DK', label: "Don't know", pna: true };

const o = (v, label, pts) => (pts === undefined ? { v, label } : { v, label, pts });

const CONSENT_TEXT =
  'Julley. I am working with Project DYESKIT, a study of village well-being in Ladakh. ' +
  'I would like to ask about your household — health, work, community, environment, and how you feel about life here. ' +
  'It takes about 20 minutes. Your answers are confidential and combined with others; nothing is linked to you by name. ' +
  'You may skip any question or stop at any time. A few questions are personal — you may decline them. ' +
  'Do you agree to take part?';

const SECTIONS = [
  {
    id: 'A',
    title: 'Household & Demographic Profile',
    note: 'Context for every other answer. Only A13 (education) is scored.',
    items: [
      { id: 'A1', q: 'Village', type: 'village', required: true },
      { id: 'A2', q: 'Block / Tehsil', type: 'text' },
      { id: 'A3', q: 'District', type: 'single', required: true, options: DISTRICTS.map(d => o(d.id, d.name)) },
      { id: 'A4', q: 'Years household has lived here', type: 'number', unit: 'years', min: 0, max: 120 },
      { id: 'A5', q: 'Respondent age', type: 'number', unit: 'years', min: 18, max: 110, required: true },
      { id: 'A6', q: 'Gender', type: 'single', required: true, options: [o('male', 'Male'), o('female', 'Female'), o('other', 'Other'), PNA] },
      { id: 'A7', q: 'Household size (usually resident)', type: 'number', min: 1, max: 40, required: true },
      { id: 'A8', q: 'Members living away for work or study', type: 'number', min: 0, max: 30 },
      { id: 'A9', q: 'Family type', type: 'single', options: [o('nuclear', 'Nuclear'), o('joint', 'Joint'), o('extended', 'Extended')] },
      { id: 'A10', q: 'Religion', type: 'single', options: [o('buddhist', 'Buddhist'), o('muslim', 'Muslim'), o('hindu', 'Hindu'), o('christian', 'Christian'), o('other', 'Other'), PNA] },
      {
        id: 'A11', q: 'Housing type', type: 'single',
        options: [o('traditional', 'Traditional stone / mud-brick'), o('concrete', 'Concrete-cement'), o('hybrid', 'Modern hybrid'), o('other', 'Other')],
      },
      {
        id: 'A12', q: "Main earner's occupation", type: 'single',
        options: ['Farmer', 'Pastoralist (Changpa)', 'Tourism operator / guide', 'Homestay operator', 'Handicraft artisan',
          'Government employee', 'Teacher', 'Healthcare worker', 'Transport operator', 'Small business',
          'Monk / Nun / religious', 'Army / defence', 'Daily-wage labour', 'Student', 'Homemaker', 'Other']
          .map(t => o(t.toLowerCase().replace(/[^a-z]+/g, '_'), t)),
      },
      {
        id: 'A13', q: 'Highest education in household', type: 'single', dim: 'int', required: true,
        options: [
          o('none', 'No formal education', 0), o('primary', 'Primary', 0.25), o('secondary', 'Secondary', 0.5),
          o('higher_sec', 'Higher secondary', 0.75), o('diploma', 'Diploma', 0.75), o('bachelor', "Bachelor's", 1),
          o('master', "Master's", 1), o('doctorate', 'Doctorate', 1), o('monastic', 'Monastic', 0.5),
          o('vocational', 'Vocational', 0.5), o('other', 'Other', 0.5),
        ],
      },
    ],
  },
  {
    id: 'B',
    title: 'Physical Wellness',
    note: 'B1: measure height and weight with the kit. Do not accept self-report — mark "not collected" if no kit.',
    items: [
      { id: 'B1', q: 'Measured height & weight', type: 'measure', dim: 'phy', rule: 'bmi', fields: [{ k: 'height_cm', label: 'Height', unit: 'cm', min: 100, max: 220 }, { k: 'weight_kg', label: 'Weight', unit: 'kg', min: 20, max: 200 }] },
      { id: 'B2', q: 'Diagnosed chronic illness?', type: 'single', dim: 'phy', options: [o('none', 'None', 1), o('managed', 'Managed with medication', 0.5), o('unmanaged', 'Unmanaged or severe', 0), DK] },
      { id: 'B2a', q: 'If yes, which condition? (optional)', type: 'text', showIf: { item: 'B2', in: ['managed', 'unmanaged'] } },
      { id: 'B3', q: 'Altitude symptoms (breathlessness, chronic headache, fatigue)?', type: 'single', dim: 'phy', options: [o('never', 'Never', 1), o('occasionally', 'Occasionally', 0.5), o('frequently', 'Frequently', 0)] },
      { id: 'B4', q: "Nearest health facility you'd use", type: 'single', dim: 'phy', rule: 'healthcare', options: [o('in_village', 'In village', 1), o('camp', 'Mobile camp', 1), o('1_10', '1–10 km', 0.75), o('11_20', '11–20 km', 0.5), o('over_20', 'More than 20 km', 0)] },
      { id: 'B5', q: 'Last year, unable to reach care due to snow, road or distance?', type: 'single', dim: 'phy', rule: 'healthcare', options: [o('never', 'Never', 1), o('once', 'Once', 0.5), o('more', 'More than once', 0)] },
      { id: 'B6', q: 'Typical daily physical activity', type: 'single', dim: 'phy', options: [o('active', 'Active work (farming, herding, labour)', 1), o('moderate', 'Moderate', 0.5), o('sedentary', 'Sedentary', 0)] },
      { id: 'B7', q: 'Adequate sleep (about 7 hours) most nights?', type: 'single', dim: 'phy', options: [o('always', 'Always', 1), o('mostly', 'Mostly', 0.67), o('rarely', 'Rarely', 0.33), o('never', 'Never', 0)] },
      { id: 'B8', q: 'Household toilet', type: 'single', dim: 'phy', options: [o('proper', 'Toilet + proper waste disposal', 1), o('dry_compost', 'Traditional dry-compost toilet', 1), o('no_disposal', 'Toilet without proper disposal', 0.5), o('none', 'No toilet', 0)], help: 'A dry-compost toilet scores full marks: it is a water-saving, cold-adapted technology, not a deficiency.' },
      { id: 'B9', q: 'Drinking water source(s)', type: 'multi', options: [o('piped', 'Piped'), o('yura', 'Glacier-melt channel (yura)'), o('chumik', 'Spring (chumik)'), o('stream', 'Stream / river'), o('borewell', 'Borewell'), o('tanker', 'Tanker'), o('snowmelt', 'Snowmelt storage')] },
      { id: 'B10', q: 'Drinking water quality', type: 'single', dim: 'env', options: [o('safe', 'Safe as-is', 1), o('needs_treatment', 'Needs boiling / filtration', 0.5), o('occasional', 'Occasionally contaminated', 0.25), o('unsafe', 'Unsafe', 0), DK] },
      { id: 'B11', q: 'I am satisfied with my physical health.', type: 'likert', dim: 'phy' },
    ],
  },
  {
    id: 'C',
    title: 'Mental & Emotional Wellness',
    items: [
      { id: 'C1', q: 'Overall, how do you feel emotionally?', type: 'single', dim: 'emo', options: [o('fit', 'Fit (calm, focused)', 1), o('stable', 'Generally stable', 0.5), o('challenges', 'Facing challenges', 0), PNA] },
      { id: 'C2', q: 'What emotional support can you turn to?', type: 'multi', dim: 'emo', rule: 'support_count', options: [o('family', 'Family / friends'), o('religious', 'Religious / spiritual community'), o('professional', 'Professional (counselling)'), o('coping', 'Personal coping (prayer, walking, art)'), o('none', 'None'), PNA] },
      { id: 'C3', q: 'How do you recover from stress?', type: 'single', dim: 'emo', options: [o('low', 'Low stress, quick recovery', 1), o('moderate', 'Moderate', 0.5), o('high', 'High, difficult', 0), PNA] },
      { id: 'C4', q: 'In the last month I have felt hopeful about the future.', type: 'likert', dim: 'emo' },
      { id: 'C5', q: 'Overall life satisfaction', type: 'likert', dim: 'emo', scale: ['Very dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very satisfied'] },
      { id: 'C6', q: 'I feel isolated or cut off during winter months.', type: 'likert_rev', dim: 'emo' },
      { id: 'C7', q: 'Do household members regularly use any of these?', type: 'multi', sensitive: true, options: [o('tobacco', 'Tobacco'), o('alcohol', 'Alcohol'), o('chhang', 'Local brew (chhang)'), o('none', 'None'), PNA], help: 'Not scored. Reported only as a village prevalence flag. Where literacy allows, hand the respondent the card to mark privately.' },
    ],
  },
  {
    id: 'D',
    title: 'Social Wellness',
    items: [
      { id: 'D1', q: 'Participation in community activities (festivals, meetings, collective labour)', type: 'single', dim: 'soc', options: [o('regular', 'Regular', 1), o('occasional', 'Occasional', 0.5), o('none', 'None', 0)] },
      { id: 'D2', q: 'I trust the people in my village.', type: 'likert', dim: 'soc' },
      { id: 'D3', q: 'Level of conflict or tension in the village', type: 'single', dim: 'soc', options: [o('high_trust', 'High trust, low conflict', 1), o('moderate', 'Moderate', 0.5), o('frequent', 'Frequent conflict', 0)] },
      { id: 'D4', q: 'Do women and marginalized groups take part equally in decisions?', type: 'single', dim: 'soc', options: [o('equal', 'Equal', 1), o('partial', 'Partial', 0.5), o('exclusion', 'Exclusion', 0)] },
      { id: 'D5', q: 'Elders are respected and youth are engaged in village life.', type: 'likert', dim: 'soc' },
      { id: 'D6', q: 'A village institution you can turn to?', type: 'multi', dim: 'soc', rule: 'institution_count', options: [o('committee', 'Village Committee'), o('goba', 'Goba'), o('lahdc', 'LAHDC body'), o('monastery', 'Monastery committee'), o('anjuman', 'Mosque / anjuman committee'), o('shg', "Women's group / SHG"), o('youth', 'Youth group'), o('none', 'None functions')] },
      { id: 'D7', q: 'My community would help my household in an emergency.', type: 'likert', dim: 'soc' },
      { id: 'D8', q: 'Youth from the household left for work or study in the last 3 years?', type: 'single', options: [o('no', 'No'), o('yes', 'Yes')] },
      { id: 'D8a', q: 'If yes, how many?', type: 'number', min: 0, max: 20, showIf: { item: 'D8', in: ['yes'] } },
    ],
  },
  {
    id: 'E',
    title: 'Environmental Wellness',
    items: [
      { id: 'E1', q: 'Water supply reliable through the year?', type: 'single', dim: 'env', rule: 'water_reliability', options: [o('reliable', 'Reliable', 1), o('scarce', 'Scarce some months', null), o('severe', 'Severe shortage or contamination', 0)] },
      { id: 'E1a', q: 'If scarce, how many months?', type: 'number', min: 1, max: 12, unit: 'months', showIf: { item: 'E1', in: ['scarce'] } },
      { id: 'E2', q: 'Change in glacier melt / snowfall / stream flow over 10 years?', type: 'single', options: [o('large_dec', 'Large decrease'), o('some_dec', 'Some decrease'), o('no_change', 'No change'), o('increase', 'Increase'), DK] },
      { id: 'E3', q: 'Local or own-grown vs packaged food', type: 'single', dim: 'env', options: [o('mostly_local', 'Mostly local', 1), o('mixed', 'Mixed', 0.5), o('mostly_packaged', 'Mostly packaged', 0)] },
      { id: 'E4', q: 'Household waste practice', type: 'single', dim: 'env', options: [o('segregated', 'Segregated + disposed', 1), o('partial', 'Partly managed', 0.5), o('burned', 'Burned', 0.25), o('dumping', 'Open dumping', 0)] },
      { id: 'E5', q: 'Main cooking & heating fuel(s)', type: 'multi', dim: 'env', rule: 'fuel', options: [o('solar', 'Solar', 1), o('electricity', 'Electricity', 1), o('biogas', 'Biogas', 1), o('lpg', 'LPG', 0.75), o('firewood', 'Firewood', 0.33), o('dung', 'Dung cakes', 0), o('kerosene', 'Kerosene', 0)] },
      { id: 'E6', q: 'Climate / water adaptation measures adopted?', type: 'multi', dim: 'env', rule: 'adapt_count', options: [o('storage', 'Water storage tank'), o('ice_stupa', 'Ice stupa participation'), o('greenhouse', 'Greenhouse / trombe wall'), o('passive_solar', 'Passive-solar retrofit'), o('insulation', 'Insulation'), o('harvesting', 'Rainwater / snowmelt harvesting'), o('none', 'None')] },
      { id: 'E7', q: 'Tourist-related waste is a growing problem near my village.', type: 'likert' },
    ],
  },
  {
    id: 'F',
    title: 'Economic & Occupational Wellness',
    items: [
      { id: 'F1', q: 'Yearly household income (all sources)', type: 'single', dim: 'fin', options: [o('lt1', 'Below ₹1 lakh', 0), o('1_3', '₹1–3 lakh', 0.33), o('3_5', '₹3–5 lakh', 0.67), o('5_10', '₹5–10 lakh', 0.85), o('gt10', 'Above ₹10 lakh', 1), PNA] },
      { id: 'F2', q: 'Does income cover needs through the year?', type: 'single', dim: 'fin', options: [o('surplus', 'Covers + surplus', 1), o('basics', 'Covers basics only', 0.5), o('no', 'Does not cover', 0)] },
      { id: 'F3', q: 'Savings or assets to fall back on?', type: 'single', dim: 'fin', options: [o('yes', 'Savings / land / livestock / SHG', 1), o('limited', 'Limited', 0.5), o('none', 'None or in debt', 0)] },
      { id: 'F4', q: 'Number of separate income sources', type: 'number', dim: 'fin', rule: 'income_sources', min: 0, max: 10 },
      { id: 'F5', q: 'Household earns from?', type: 'multi', options: [o('farming', 'Farming'), o('livestock', 'Livestock / pashmina'), o('tourism', 'Tourism / guiding / transport'), o('homestay', 'Homestay'), o('handicraft', 'Handicraft'), o('salary', 'Govt salary / pension'), o('daily_wage', 'Daily wage'), o('business', 'Small business'), o('remittance', 'Remittance'), o('other', 'Other')] },
      { id: 'F6', q: 'In which months is most income earned?', type: 'multi', dim: 'fin', rule: 'seasonality', options: [o('q1', 'Jan–Mar'), o('q2', 'Apr–Jun'), o('q3', 'Jul–Sep'), o('q4', 'Oct–Dec'), o('even', 'Even year-round')] },
      { id: 'F7', q: 'Extreme-weather damage to crops, livestock or property in last 5 years?', type: 'single', dim: 'fin', options: [o('no', 'No', 1), o('once', 'Once', 0.5), o('more', 'More than once', 0)] },
      { id: 'F8', q: "I feel financially secure about my household's future.", type: 'likert', dim: 'fin' },
      { id: 'F9', q: 'Aware of / using a government livelihood scheme?', type: 'single', dim: 'fin', help: 'MGNREGA, PM-KISAN, livestock insurance, homestay schemes, PMAY.', options: [o('using', 'Aware & using', 1), o('aware', 'Aware, not using', 0.5), o('not_aware', 'Not aware', 0)] },
      { id: 'F10', q: 'Household has a bank account?', type: 'single', dim: 'fin', options: [o('yes', 'Yes', 1), o('no', 'No', 0)] },
    ],
  },
  {
    id: 'G',
    title: 'Intellectual Wellness',
    items: [
      { id: 'G1', q: 'Anyone currently learning a new skill or subject?', type: 'single', dim: 'int', options: [o('active', 'Actively', 1), o('occasional', 'Occasionally', 0.5), o('none', 'Not at all', 0)] },
      { id: 'G2', q: 'Can you find & judge information using phone, computer or internet?', type: 'single', dim: 'int', options: [o('confident', 'Confidently', 1), o('some_difficulty', 'With some difficulty', 0.5), o('no', 'No', 0)] },
      { id: 'G3', q: 'Aware of basic civic rights & entitlements?', type: 'single', dim: 'int', options: [o('well', 'Well aware', 1), o('partly', 'Partly', 0.5), o('not', 'Not aware', 0)] },
      { id: 'G4', q: 'Aware of climate change and its impact on Ladakh?', type: 'single', dim: 'int', options: [o('well', 'Well aware', 1), o('partly', 'Partly', 0.5), o('not', 'Not aware', 0)] },
      { id: 'G5', q: 'Barriers to education in your household?', type: 'multi', dim: 'int', rule: 'barriers', options: [o('distance', 'Distance'), o('cost', 'Cost'), o('winter', 'Winter closure'), o('teachers', 'Lack of teachers'), o('language', 'Language of instruction'), o('none', 'No barriers')] },
    ],
  },
  {
    id: 'H',
    title: 'Spiritual & Cultural Wellness',
    items: [
      { id: 'H1', q: 'How regularly do you pray, meditate or do religious practice?', type: 'single', dim: 'spi', options: [o('daily', 'Daily', 1), o('weekly', 'Weekly', 0.67), o('occasional', 'Occasionally', 0.33), o('never', 'Never', 0)] },
      { id: 'H2', q: 'I have a clear sense of purpose and direction.', type: 'likert', dim: 'spi' },
      { id: 'H3', q: 'My decisions are guided by ethical or spiritual values.', type: 'likert', dim: 'spi' },
      { id: 'H4', q: 'I generally feel inner peace and contentment.', type: 'likert', dim: 'spi' },
      { id: 'H5', q: 'Can you reach a monastery, mosque or place of worship when you wish?', type: 'single', dim: 'spi', options: [o('in_village', 'In village', 1), o('within_10', 'Within 10 km', 0.67), o('beyond_10', 'Beyond 10 km', 0.33), o('seasonal', 'Seasonal only', 0)] },
      { id: 'H6', q: 'Festival / cultural participation', type: 'single', dim: 'spi', help: 'Interviewer: use local examples — Losar/Hemis in Buddhist villages; Eid/Nowruz observances in Kargil.', options: [o('regular', 'Regular', 1), o('occasional', 'Occasional', 0.5), o('never', 'Never', 0)] },
      { id: 'H7', q: 'Are younger people losing interest in Ladakhi language, festivals and practices?', type: 'single', dim: 'spi', options: [o('strongly_agree', 'Strongly agree', 0), o('agree', 'Agree', 0.25), o('neutral', 'Neutral', 0.5), o('disagree', 'Disagree', 0.75), o('strongly_disagree', 'Strongly disagree', 1)] },
    ],
  },
  {
    id: 'I',
    title: 'Technology, AI & Development Priorities',
    note: 'Diagnostic. Reported separately; not part of the well-being score.',
    items: [
      { id: 'I1', q: 'Household has a smartphone?', type: 'single', options: [o('more_than_one', 'Yes, more than one'), o('one', 'Yes, one'), o('no', 'No')] },
      { id: 'I2', q: 'Internet access', type: 'single', options: [o('reliable', 'Reliable broadband / 4G'), o('intermittent', 'Intermittent mobile data'), o('none', 'None')] },
      { id: 'I3', q: 'Heard of or used an AI tool (chatbot, voice assistant)?', type: 'single', options: [o('use', 'Use it'), o('aware', "Aware, don't use"), o('never', 'Never heard')] },
      { id: 'I4', q: 'Would use a phone assistant for…?', type: 'multi', options: [o('health', 'Health info'), o('weather', 'Weather / road status'), o('schemes', 'Scheme info'), o('farming', 'Farming / livestock advice'), o('education', 'Education'), o('tourism', 'Tourism / business'), o('none', 'Not interested')] },
      {
        id: 'I5', q: "Rank your village's top 3 development priorities", type: 'rank3',
        options: [o('water', 'Water security'), o('health', 'Healthcare'), o('roads', 'Roads / winter connectivity'), o('education', 'Education'), o('jobs', 'Employment'), o('energy', 'Renewable energy / heating'), o('waste', 'Waste management'), o('tourism', 'Tourism management'), o('culture', 'Cultural preservation'), o('digital', 'Digital connectivity')],
      },
    ],
  },
];

/** Flat index of every item by id. */
const ITEMS = {};
for (const s of SECTIONS) for (const it of s.items) ITEMS[it.id] = { ...it, section: s.id };

/** Items that feed a dimension score. */
const SCORED_ITEMS = Object.values(ITEMS).filter(i => i.dim);

const DIM_ITEMS = {};
for (const d of DIMENSIONS) DIM_ITEMS[d.id] = SCORED_ITEMS.filter(i => i.dim === d.id).map(i => i.id);

module.exports = { QUESTIONNAIRE_VERSION, DIMENSIONS, BANDS, SECTIONS, ITEMS, SCORED_ITEMS, DIM_ITEMS, CONSENT_TEXT };
