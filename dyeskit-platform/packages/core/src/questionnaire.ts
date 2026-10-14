/**
 * DYESKIT Ladakh Village Well-Being Questionnaire — v3.0
 *
 * One source of truth for the survey form (app), scoring (app + server) and the
 * scoring explanation (docs/SCORING.md and the "How scores work" screen).
 *
 * Scoring is deliberately simple — every rule is a fixed lookup, never a formula:
 *   • each scored question gives FIXED POINTS from 0 to 100 for each answer
 *   • "Don't know" / "Prefer not to answer" gives 50 points (the middle)
 *   • a few multi-select questions score by HOW MANY options are ticked, again
 *     through a fixed table (e.g. support types: 0 → 0, 1 → 50, 2 → 75, 3 or more → 100)
 *   • height and weight score through a fixed BMI table (Asian cut-offs)
 *
 * Changes from v2 (to remove every calculation):
 *   • 1–5 agreement questions: fixed points 0 / 25 / 50 / 75 / 100 per answer
 *     (instead of "(answer − 1) ÷ 4")
 *   • water reliability: one question with fixed answers by number of scarce months
 *     (instead of "1 − months ÷ 12")
 *   • income spread over the year: one choice — even / three / two / one season
 *     (instead of counting ticked quarters)
 *   • cooking fuel: the MAIN fuel only (instead of averaging several fuels)
 *   • healthcare distance and winter access are two separate questions
 *     (instead of being averaged into one indicator)
 *   • income bands and education use round steps of 25
 *
 * Changes in v3.1:
 *   • household size (A7) is a family roster: number of males and females, and each one's age
 *   • new A14: family members with a permanent job and with a temporary job
 *   • A12: "Pastoralist" (was "Pastoralist (Changpa)")
 *   • height and weight (B1) are optional, asked only if the family agrees (B1s), for each
 *     family member on the roster; the BMI score is the average over the adults measured
 *   • physical-wellness questions ask about the family as a whole; B6 uses plain words
 *   • B9 no longer lists "Snowmelt storage"
 *   • B11 ("We are satisfied with our family's physical health", agree/disagree) is replaced by
 *     B12, a 1–5 rating of the family's overall physical health. B12 keeps its own id so earlier
 *     B11 answers are never read as ratings.
 *   • Emotional questions ask about the family. C4 (hope) is removed; new C8 family harmony,
 *     C9 time together, C10 persistent worry, C11 knows where to get help. Ids are never reused.
 *   • Social questions ask about the family and its village; D8 (young people who left) is removed —
 *     A8 already counts members living away for work or study
 *   • new F11: does the family have a loan (not scored), asked after savings (F3)
 *   • new G6: how many family members can read and write (scored); G7: languages understood (not scored)
 *   • H1 (how often you pray, daily/weekly…) is replaced by H8, the same idea rated 1–5; H2 (sense of
 *     purpose) is removed
 */

export type DimensionId = 'phy' | 'fin' | 'emo' | 'soc' | 'env' | 'int' | 'spi';

export interface Dimension {
  id: DimensionId;
  name: string;
  short: string;
  /** one line for people who have never seen the framework */
  about: string;
}

export const DIMENSIONS: Dimension[] = [
  { id: 'phy', name: 'Physical', short: 'Physical', about: 'Health, nutrition, sleep, sanitation and access to care' },
  { id: 'fin', name: 'Financial', short: 'Financial', about: 'Income, savings, livelihoods and security' },
  { id: 'emo', name: 'Emotional', short: 'Emotional', about: 'Mood, support, stress, hope and isolation' },
  { id: 'soc', name: 'Social', short: 'Social', about: 'Trust, participation, inclusion and institutions' },
  { id: 'env', name: 'Environmental', short: 'Environment', about: 'Water, food, waste, fuel and climate adaptation' },
  { id: 'int', name: 'Intellectual', short: 'Intellectual', about: 'Education, learning, digital and civic awareness' },
  { id: 'spi', name: 'Spiritual', short: 'Spiritual', about: 'Practice, purpose, peace, worship and culture' },
];

export const DIMENSION_BY_ID = Object.fromEntries(DIMENSIONS.map(d => [d.id, d])) as Record<DimensionId, Dimension>;

export interface Band {
  band: number;
  min: number;
  max: number;
  label: string;
  short: string;
}

/** Score bands on the 0–100 scale. A score belongs to the band whose range contains it. */
export const BANDS: Band[] = [
  { band: 1, min: 0, max: 14.999, label: 'Foundational Support Needed', short: 'Foundational' },
  { band: 2, min: 15, max: 28.999, label: 'Emerging Well-Being', short: 'Emerging' },
  { band: 3, min: 29, max: 42.999, label: 'Developing Well-Being', short: 'Developing' },
  { band: 4, min: 43, max: 56.999, label: 'Basic Well-Being Achieved', short: 'Basic' },
  { band: 5, min: 57, max: 70.999, label: 'Advancing Well-Being', short: 'Advancing' },
  { band: 6, min: 71, max: 84.999, label: 'Strong Well-Being', short: 'Strong' },
  { band: 7, min: 85, max: 100, label: 'Thriving Well-Being', short: 'Thriving' },
];

export interface Option {
  v: string;
  label: string;
  /** fixed points 0–100; omitted = this answer is not scored */
  points?: number;
  /** "Don't know" / "Prefer not to answer": scores the neutral 50 */
  neutral?: boolean;
}

/**
 * family: the roster — males, females and each one's age (see family.ts)
 * measure: height and weight for each family member on the roster
 * counts: a few whole numbers side by side (fields)
 */
export type ItemType = 'village' | 'single' | 'scale' | 'multi' | 'number' | 'text' | 'measure' | 'rank3' | 'family' | 'counts';

export interface Item {
  id: string;
  q: string;
  type: ItemType;
  /** dimension this question scores in; omitted = context only, not scored */
  dim?: DimensionId;
  /** short name used in charts and the scoring explanation */
  indicator?: string;
  options?: Option[];
  /** multi-select / number questions scored by count: points[count], last entry = "or more" */
  countPoints?: number[];
  /** what is being counted, for the explanation ("support types") */
  counts?: string;
  /** height + weight scored through BMI_TABLE (adults only; the average over the family) */
  bmi?: true;
  required?: boolean;
  help?: string;
  showIf?: { item: string; in: string[] };
  unit?: string;
  min?: number;
  max?: number;
  fields?: { k: string; label: string; unit: string; min: number; max: number }[];
  sensitive?: boolean;
}

export interface Section {
  id: string;
  title: string;
  /** short friendly title for the progress bar */
  short: string;
  icon: string;
  note?: string;
  items: Item[];
}

export const QUESTIONNAIRE_VERSION = 'v3.1';

const PNA: Option = { v: 'PNA', label: 'Prefer not to answer', neutral: true };
const DK: Option = { v: 'DK', label: "Don't know", neutral: true };
const o = (v: string, label: string, points?: number): Option => (points === undefined ? { v, label } : { v, label, points });

/** The five-point agreement scale with its fixed points. */
const AGREE = (labels = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree']): Option[] =>
  labels.map((label, i) => o(String(i + 1), label, i * 25));
/** The same scale where agreeing is the bad answer ("I feel isolated…"). */
const AGREE_REVERSED = (labels = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree']): Option[] =>
  labels.map((label, i) => o(String(i + 1), label, 100 - i * 25));

/** Asia-Pacific (ICMR / WHO) BMI cut-offs — deliberately not the Western bands. */
export const BMI_TABLE: { from: number; to: number; points: number; label: string }[] = [
  { from: 18.5, to: 22.9, points: 100, label: 'Healthy (18.5–22.9)' },
  { from: 23.0, to: 24.9, points: 70, label: 'Overweight (23.0–24.9)' },
  { from: 17.0, to: 18.4, points: 60, label: 'Mildly thin (17.0–18.4)' },
  { from: 25.0, to: 29.9, points: 40, label: 'Obese (25.0–29.9)' },
  { from: 16.0, to: 16.9, points: 30, label: 'Moderately thin (16.0–16.9)' },
];
export const BMI_OTHER_POINTS = 0; // below 16.0 or 30.0 and above
/** The cut-offs above are for adults; children's height and weight are recorded but not scored. */
export const BMI_MIN_AGE = 18;

export const CONSENT_TEXT =
  'Julley. I am working with Project DYESKIT, a study of village well-being in Ladakh. ' +
  'I would like to ask about your household — health, work, community, environment, and how you feel about life here. ' +
  'It takes about 20 minutes. Your answers are confidential and combined with others; nothing is linked to you by name. ' +
  'You may skip any question or stop at any time. A few questions are personal — you may decline them. ' +
  'Do you agree to take part?';

export const SECTIONS: Section[] = [
  {
    id: 'A', title: 'Household & Demographic Profile', short: 'Household', icon: 'home',
    note: 'Context for every other answer. Only education (A13) is scored. Questions are about the whole family, except the respondent’s own age and gender.',
    items: [
      { id: 'A1', q: 'Village', type: 'village', required: true },
      { id: 'A4', q: 'Years household has lived here', type: 'number', unit: 'years', min: 0, max: 120 },
      { id: 'A5', q: 'Respondent age', type: 'number', unit: 'years', min: 18, max: 110, required: true },
      { id: 'A6', q: 'Gender', type: 'single', required: true, options: [o('male', 'Male'), o('female', 'Female'), o('other', 'Other'), PNA] },
      { id: 'A7', q: 'Family members living in the household', type: 'family', required: true,
        help: 'Count everyone who usually lives here, including children. Then give each person’s age.' },
      { id: 'A8', q: 'Members living away for work or study', type: 'number', unit: 'people', min: 0, max: 30 },
      { id: 'A9', q: 'Family type', type: 'single', options: [o('nuclear', 'Nuclear'), o('joint', 'Joint'), o('extended', 'Extended')] },
      { id: 'A10', q: 'Religion', type: 'single', options: [o('buddhist', 'Buddhist'), o('muslim', 'Muslim'), o('hindu', 'Hindu'), o('christian', 'Christian'), o('other', 'Other'), PNA] },
      { id: 'A11', q: 'Housing type', type: 'single', options: [o('traditional', 'Traditional stone / mud-brick'), o('concrete', 'Concrete-cement'), o('hybrid', 'Modern hybrid'), o('other', 'Other')] },
      {
        id: 'A12', q: "Main earner's occupation", type: 'single',
        options: ['Farmer', 'Pastoralist', 'Tourism operator / guide', 'Homestay operator', 'Handicraft artisan',
          'Government employee', 'Teacher', 'Healthcare worker', 'Transport operator', 'Small business',
          'Monk / Nun / religious', 'Army / defence', 'Daily-wage labour', 'Student', 'Homemaker', 'Other']
          // "pastoralist_changpa" is the stored value from v3.0, kept so earlier surveys still read
          .map(t => o(t === 'Pastoralist' ? 'pastoralist_changpa' : t.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, ''), t)),
      },
      { id: 'A14', q: 'How many family members have a job?', type: 'counts',
        help: 'Permanent: a regular job all year (government, army, private salary). Temporary: seasonal, contract or daily-wage work.',
        fields: [{ k: 'permanent', label: 'Permanent job', unit: 'people', min: 0, max: 30 }, { k: 'temporary', label: 'Temporary job', unit: 'people', min: 0, max: 30 }] },
      {
        id: 'A13', q: 'Highest education in the household', type: 'single', dim: 'int', indicator: 'Education attained', required: true,
        options: [
          o('none', 'No formal education', 0), o('primary', 'Primary', 25), o('secondary', 'Secondary', 50),
          o('higher_sec', 'Higher secondary', 75), o('diploma', 'Diploma', 75), o('bachelor', "Bachelor's", 100),
          o('master', "Master's", 100), o('doctorate', 'Doctorate', 100), o('monastic', 'Monastic', 50),
          o('vocational', 'Vocational', 50), o('other', 'Other', 50),
        ],
      },
    ],
  },
  {
    id: 'B', title: 'Physical Wellness', short: 'Physical', icon: 'heart',
    note: 'Questions are about the whole family. Height and weight are optional: ask only if the family is willing, and measure with the kit — do not accept self-report.',
    items: [
      { id: 'B1s', q: 'Is the family willing to share each member’s height and weight? (optional)', type: 'single',
        options: [o('yes', 'Yes'), o('no', 'No, skip this')] },
      { id: 'B1', q: 'Height & weight of each family member', type: 'measure', dim: 'phy', indicator: 'Nutrition (BMI)', bmi: true,
        showIf: { item: 'B1s', in: ['yes'] },
        help: 'Leave anyone blank who does not want to be measured. Only adults (18 and over) count in the score.',
        fields: [{ k: 'height_cm', label: 'Height', unit: 'cm', min: 100, max: 220 }, { k: 'weight_kg', label: 'Weight', unit: 'kg', min: 20, max: 200 }] },
      { id: 'B2', q: 'Does anyone in the family have a long-term illness diagnosed by a doctor?', type: 'single', dim: 'phy', indicator: 'Chronic illness', options: [o('none', 'None', 100), o('managed', 'Managed with medication', 50), o('unmanaged', 'Unmanaged or severe', 0), DK] },
      { id: 'B2a', q: 'If yes, which condition? (optional)', type: 'text', showIf: { item: 'B2', in: ['managed', 'unmanaged'] } },
      { id: 'B3', q: 'Do family members get altitude symptoms (breathlessness, constant headache, tiredness)?', type: 'single', dim: 'phy', indicator: 'Altitude symptoms', options: [o('never', 'Never', 100), o('occasionally', 'Occasionally', 50), o('frequently', 'Frequently', 0)] },
      { id: 'B4', q: 'Nearest health facility the family would use', type: 'single', dim: 'phy', indicator: 'Distance to healthcare', options: [o('in_village', 'In the village', 100), o('camp', 'Regular mobile camp', 100), o('1_10', '1–10 km', 75), o('11_20', '11–20 km', 50), o('over_20', 'More than 20 km', 0)] },
      { id: 'B5', q: 'Last year, was anyone in the family unable to reach care because of snow, road or distance?', type: 'single', dim: 'phy', indicator: 'Winter access to care', options: [o('never', 'Never', 100), o('once', 'Once', 50), o('more', 'More than once', 0)] },
      { id: 'B6', q: 'How physically active is the family on a normal day?', type: 'single', dim: 'phy', indicator: 'Physical activity', options: [o('active', 'Very active — farming, herding or labour', 100), o('moderate', 'Somewhat active — walking, housework', 50), o('sedentary', 'Not active — mostly sitting', 0)] },
      { id: 'B7', q: 'Do family members get enough sleep (about 7 hours) most nights?', type: 'single', dim: 'phy', indicator: 'Sleep', options: [o('always', 'Always', 100), o('mostly', 'Mostly', 67), o('rarely', 'Rarely', 33), o('never', 'Never', 0)] },
      { id: 'B8', q: 'Family toilet', type: 'single', dim: 'phy', indicator: 'Sanitation',
        options: [o('proper', 'Toilet with proper waste disposal', 100), o('dry_compost', 'Traditional dry-compost toilet', 100), o('no_disposal', 'Toilet without proper disposal', 50), o('none', 'No toilet', 0)],
        help: 'A dry-compost toilet scores full marks: it is a water-saving, cold-adapted technology, not a deficiency.' },
      { id: 'B9', q: 'Where does the family get drinking water?', type: 'multi', options: [o('piped', 'Piped'), o('yura', 'Glacier-melt channel (yura)'), o('chumik', 'Spring (chumik)'), o('stream', 'Stream / river'), o('borewell', 'Borewell'), o('tanker', 'Tanker')] },
      { id: 'B10', q: 'Quality of the family’s drinking water', type: 'single', dim: 'env', indicator: 'Drinking water quality', options: [o('safe', 'Safe as it is', 100), o('needs_treatment', 'Needs boiling / filtering', 50), o('occasional', 'Sometimes contaminated', 25), o('unsafe', 'Unsafe', 0), DK] },
      { id: 'B12', q: 'Overall, how would you rate your family’s physical health?', type: 'scale', dim: 'phy', indicator: 'Overall physical health',
        options: AGREE(['Very poor', 'Poor', 'Fair', 'Good', 'Very good']), help: '1 = very poor, 5 = very good.' },
    ],
  },
  {
    id: 'C', title: 'Mental & Emotional Wellness', short: 'Emotional', icon: 'smile',
    note: 'Questions are about the whole family. Ask gently; any question can be skipped.',
    items: [
      { id: 'C1', q: 'Overall, how is the family feeling emotionally these days?', type: 'single', dim: 'emo', indicator: 'Emotional state', options: [o('fit', 'Calm and settled', 100), o('stable', 'Mostly fine', 50), o('challenges', 'Going through a hard time', 0), PNA] },
      { id: 'C2', q: 'Where can family members turn for emotional support?', type: 'multi', dim: 'emo', indicator: 'Support system',
        countPoints: [0, 50, 75, 100], counts: 'kinds of support ticked',
        options: [o('family', 'Each other, relatives or friends'), o('religious', 'Monastery, mosque or religious community'), o('professional', 'Doctor or counsellor'), o('coping', 'Own ways — prayer, walking, music, crafts'), o('none', 'No one'), PNA] },
      { id: 'C3', q: 'How does the family handle stress and worries?', type: 'single', dim: 'emo', indicator: 'Stress recovery', options: [o('low', 'Little stress, and we recover quickly', 100), o('moderate', 'Some stress, we manage', 50), o('high', 'A lot of stress, hard to recover', 0), PNA] },
      { id: 'C8', q: 'How well do family members get along with each other?', type: 'single', dim: 'emo', indicator: 'Family harmony', options: [o('well', 'Very well — rarely any quarrels', 100), o('mostly', 'Mostly well — quarrels sometimes', 50), o('tense', 'Often tense or quarrelling', 0), PNA] },
      { id: 'C9', q: 'How often does the family spend time together — meals, talking, prayers or festivals?', type: 'single', dim: 'emo', indicator: 'Time together', options: [o('daily', 'Most days', 100), o('weekly', 'A few times a week', 67), o('sometimes', 'Only sometimes', 33), o('rarely', 'Rarely', 0)] },
      { id: 'C10', q: 'Is anyone in the family sad, worried or unable to sleep because of worries most of the time?', type: 'single', dim: 'emo', indicator: 'Persistent worry', options: [o('no', 'No one', 100), o('sometimes', 'Someone, sometimes', 50), o('often', 'Yes, someone often feels this way', 0), PNA],
        help: 'Here "yes" is the difficult answer, so "No one" scores highest.' },
      { id: 'C11', q: 'If someone in the family felt very low, would you know where to get help?', type: 'single', dim: 'emo', indicator: 'Knows where to get help',
        help: 'For example a doctor, health worker, amchi, counsellor, lama or imam.', options: [o('yes', 'Yes', 100), o('unsure', 'Not sure', 50), o('no', 'No', 0)] },
      { id: 'C5', q: 'Overall, how satisfied is the family with life?', type: 'scale', dim: 'emo', indicator: 'Life satisfaction', options: AGREE(['Very dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very satisfied']) },
      { id: 'C6', q: 'Our family feels isolated or cut off during the winter months.', type: 'scale', dim: 'emo', indicator: 'Winter isolation', options: AGREE_REVERSED(),
        help: 'Here agreeing is the difficult answer, so "Strongly agree" scores 0.' },
      { id: 'C7', q: 'Do family members regularly use any of these?', type: 'multi', sensitive: true,
        options: [o('tobacco', 'Tobacco'), o('alcohol', 'Alcohol'), o('chhang', 'Local brew (chhang)'), o('none', 'None'), PNA],
        help: 'Not scored. Reported only as a village-level share. Where literacy allows, hand the respondent the card to mark privately.' },
    ],
  },
  {
    id: 'D', title: 'Social Wellness', short: 'Social', icon: 'users',
    note: 'Questions are about the family and its village.',
    items: [
      { id: 'D1', q: 'How often does the family take part in community activities — festivals, village meetings, shared work?', type: 'single', dim: 'soc', indicator: 'Community participation', options: [o('regular', 'Regularly', 100), o('occasional', 'Sometimes', 50), o('none', 'Never', 0)] },
      { id: 'D2', q: 'Our family trusts the people in our village.', type: 'scale', dim: 'soc', indicator: 'Trust', options: AGREE() },
      { id: 'D3', q: 'How much tension or conflict is there in the village?', type: 'single', dim: 'soc', indicator: 'Conflict level', options: [o('high_trust', 'Very little — people get along', 100), o('moderate', 'Some', 50), o('frequent', 'A lot of conflict', 0)] },
      { id: 'D4', q: 'Do women and less-heard groups have an equal say in village decisions?', type: 'single', dim: 'soc', indicator: 'Inclusion', options: [o('equal', 'Yes, an equal say', 100), o('partial', 'Partly', 50), o('exclusion', 'No, they are left out', 0)] },
      { id: 'D5', q: 'In our village, elders are respected and young people take part in village life.', type: 'scale', dim: 'soc', indicator: 'Between generations', options: AGREE() },
      { id: 'D6', q: 'Which village groups can the family turn to for help?', type: 'multi', dim: 'soc', indicator: 'Village institutions',
        countPoints: [0, 50, 100], counts: 'groups ticked',
        options: [o('committee', 'Village committee'), o('goba', 'Goba (village head)'), o('lahdc', 'LAHDC councillor or office'), o('monastery', 'Monastery committee'), o('anjuman', 'Mosque / anjuman committee'), o('shg', "Women's group / SHG"), o('youth', 'Youth group'), o('none', 'None of these work')] },
      { id: 'D7', q: 'Our village would help our family in an emergency.', type: 'scale', dim: 'soc', indicator: 'Emergency support', options: AGREE() },
    ],
  },
  {
    id: 'E', title: 'Environmental Wellness', short: 'Environment', icon: 'droplet',
    items: [
      { id: 'E1', q: 'Is your water supply reliable through the year?', type: 'single', dim: 'env', indicator: 'Water reliability',
        options: [o('reliable', 'Reliable all year', 100), o('scarce_1_3', 'Scarce 1–3 months a year', 75), o('scarce_4_6', 'Scarce 4–6 months a year', 50),
          o('scarce_7_plus', 'Scarce 7 months or more', 25), o('severe', 'Severe shortage or contamination', 0)] },
      { id: 'E2', q: 'Change in glacier melt / snowfall / stream flow over 10 years?', type: 'single', options: [o('large_dec', 'Large decrease'), o('some_dec', 'Some decrease'), o('no_change', 'No change'), o('increase', 'Increase'), DK] },
      { id: 'E3', q: 'Local or own-grown food vs packaged food', type: 'single', dim: 'env', indicator: 'Local food', options: [o('mostly_local', 'Mostly local', 100), o('mixed', 'Mixed', 50), o('mostly_packaged', 'Mostly packaged', 0)] },
      { id: 'E4', q: 'Household waste practice', type: 'single', dim: 'env', indicator: 'Waste practice', options: [o('segregated', 'Separated and disposed of', 100), o('partial', 'Partly managed', 50), o('burned', 'Burned', 25), o('dumping', 'Dumped in the open', 0)] },
      { id: 'E5', q: 'MAIN fuel for cooking and heating', type: 'single', dim: 'env', indicator: 'Cooking / heating fuel',
        options: [o('solar', 'Solar', 100), o('electricity', 'Electricity', 100), o('biogas', 'Biogas', 100), o('lpg', 'LPG', 75), o('firewood', 'Firewood', 25), o('dung', 'Dung cakes', 0), o('kerosene', 'Kerosene', 0)],
        help: 'Choose the one fuel used most. If two are used equally, choose the one used in winter.' },
      { id: 'E6', q: 'Climate / water adaptation measures adopted?', type: 'multi', dim: 'env', indicator: 'Climate adaptation',
        countPoints: [0, 50, 100], counts: 'measures ticked',
        options: [o('storage', 'Water storage tank'), o('ice_stupa', 'Ice stupa participation'), o('greenhouse', 'Greenhouse / trombe wall'), o('passive_solar', 'Passive-solar retrofit'), o('insulation', 'Insulation'), o('harvesting', 'Rainwater / snowmelt harvesting'), o('none', 'None')] },
      { id: 'E7', q: 'Tourist-related waste is a growing problem near my village.', type: 'scale', options: AGREE().map(({ v, label }) => ({ v, label })) },
    ],
  },
  {
    id: 'F', title: 'Economic & Occupational Wellness', short: 'Financial', icon: 'briefcase',
    items: [
      { id: 'F1', q: 'Yearly household income (all sources)', type: 'single', dim: 'fin', indicator: 'Income level', options: [o('lt1', 'Below ₹1 lakh', 0), o('1_3', '₹1–3 lakh', 25), o('3_5', '₹3–5 lakh', 50), o('5_10', '₹5–10 lakh', 75), o('gt10', 'Above ₹10 lakh', 100), PNA] },
      { id: 'F2', q: 'Does income cover needs through the year?', type: 'single', dim: 'fin', indicator: 'Income sufficiency', options: [o('surplus', 'Covers needs, with some left over', 100), o('basics', 'Covers basics only', 50), o('no', 'Does not cover', 0)] },
      { id: 'F3', q: 'Savings or assets to fall back on?', type: 'single', dim: 'fin', indicator: 'Savings / assets', options: [o('yes', 'Yes — savings, land, livestock or SHG', 100), o('limited', 'Limited', 50), o('none', 'None, or in debt', 0)] },
      { id: 'F11', q: 'Does the family have a loan at the moment?', type: 'single',
        help: 'Any loan — bank, Kisan credit card, SHG, moneylender, or relatives. Not scored.',
        options: [o('no', 'No'), o('yes', 'Yes'), PNA] },
      { id: 'F4', q: 'Number of separate income sources', type: 'number', dim: 'fin', indicator: 'Livelihood diversity', min: 0, max: 10, unit: 'sources',
        countPoints: [0, 50, 75, 100], counts: 'income sources' },
      { id: 'F5', q: 'The household earns from…', type: 'multi', options: [o('farming', 'Farming'), o('livestock', 'Livestock / pashmina'), o('tourism', 'Tourism / guiding / transport'), o('homestay', 'Homestay'), o('handicraft', 'Handicraft'), o('salary', 'Govt salary / pension'), o('daily_wage', 'Daily wage'), o('business', 'Small business'), o('remittance', 'Remittance'), o('other', 'Other')] },
      { id: 'F6', q: 'How is the income spread over the year?', type: 'single', dim: 'fin', indicator: 'Income through the year',
        options: [o('even', 'Evenly, all year round', 100), o('three', 'Three seasons', 75), o('two', 'Two seasons', 50), o('one', 'One season only', 25)] },
      { id: 'F7', q: 'Extreme-weather damage to crops, livestock or property in the last 5 years?', type: 'single', dim: 'fin', indicator: 'Climate shocks', options: [o('no', 'No', 100), o('once', 'Once', 50), o('more', 'More than once', 0)] },
      { id: 'F8', q: "I feel financially secure about my household's future.", type: 'scale', dim: 'fin', indicator: 'Felt financial security', options: AGREE() },
      { id: 'F9', q: 'Aware of / using a government livelihood scheme?', type: 'single', dim: 'fin', indicator: 'Government schemes', help: 'MGNREGA, PM-KISAN, livestock insurance, homestay schemes, PMAY.', options: [o('using', 'Aware and using one', 100), o('aware', 'Aware, not using', 50), o('not_aware', 'Not aware', 0)] },
      { id: 'F10', q: 'Does the household have a bank account?', type: 'single', dim: 'fin', indicator: 'Bank account', options: [o('yes', 'Yes', 100), o('no', 'No', 0)] },
    ],
  },
  {
    id: 'G', title: 'Intellectual Wellness', short: 'Intellectual', icon: 'book-open',
    items: [
      { id: 'G1', q: 'Is anyone currently learning a new skill or subject?', type: 'single', dim: 'int', indicator: 'Active learning', options: [o('active', 'Actively', 100), o('occasional', 'Occasionally', 50), o('none', 'Not at all', 0)] },
      { id: 'G2', q: 'Can you find and judge information using a phone, computer or the internet?', type: 'single', dim: 'int', indicator: 'Digital literacy', options: [o('confident', 'Confidently', 100), o('some_difficulty', 'With some difficulty', 50), o('no', 'No', 0)] },
      { id: 'G3', q: 'Aware of basic civic rights and entitlements?', type: 'single', dim: 'int', indicator: 'Civic awareness', options: [o('well', 'Well aware', 100), o('partly', 'Partly', 50), o('not', 'Not aware', 0)] },
      { id: 'G4', q: 'Aware of climate change and its impact on Ladakh?', type: 'single', dim: 'int', indicator: 'Climate awareness', options: [o('well', 'Well aware', 100), o('partly', 'Partly', 50), o('not', 'Not aware', 0)] },
      { id: 'G5', q: 'Barriers to education in your household?', type: 'multi', dim: 'int', indicator: 'Education barriers',
        countPoints: [100, 67, 33, 0], counts: 'barriers ticked (fewer is better)',
        options: [o('distance', 'Distance'), o('cost', 'Cost'), o('winter', 'Winter closure'), o('teachers', 'Lack of teachers'), o('language', 'Language of instruction'), o('none', 'No barriers')] },
      { id: 'G6', q: 'How many family members can read and write?', type: 'single', dim: 'int', indicator: 'Literacy',
        help: 'In any language. Count only those aged 7 and over.',
        options: [o('all', 'Everyone', 100), o('most', 'Most of them', 75), o('half', 'About half', 50), o('few', 'Only one or a few', 25), o('none', 'No one', 0)] },
      { id: 'G7', q: 'Which of these languages can someone in the family understand?', type: 'multi',
        help: 'Not scored. Tick a language if at least one family member understands it.',
        options: [o('hindi', 'Hindi'), o('urdu', 'Urdu'), o('english', 'English'), o('foreign', 'A foreign language (e.g. French, German, Japanese)'), o('none', 'None of these')] },
    ],
  },
  {
    id: 'H', title: 'Spiritual & Cultural Wellness', short: 'Spiritual', icon: 'sun',
    items: [
      { id: 'H8', q: 'How much are prayer, meditation or religious practice part of the family’s life?', type: 'scale', dim: 'spi', indicator: 'Spiritual practice',
        options: AGREE(['Not at all', 'A little', 'Somewhat', 'Quite a lot', 'Very much']), help: '1 = not at all, 5 = very much — part of every day.' },
      { id: 'H3', q: 'My decisions are guided by ethical or spiritual values.', type: 'scale', dim: 'spi', indicator: 'Ethical living', options: AGREE() },
      { id: 'H4', q: 'I generally feel inner peace and contentment.', type: 'scale', dim: 'spi', indicator: 'Inner peace', options: AGREE() },
      { id: 'H5', q: 'Can you reach a monastery, mosque or place of worship when you wish?', type: 'single', dim: 'spi', indicator: 'Access to worship', options: [o('in_village', 'Yes, in the village', 100), o('within_10', 'Within 10 km', 67), o('beyond_10', 'Beyond 10 km', 33), o('seasonal', 'Only in some seasons', 0)] },
      { id: 'H6', q: 'Festival / cultural participation', type: 'single', dim: 'spi', indicator: 'Festivals', help: 'Use local examples — Losar or Hemis Tsechu in Buddhist villages; Eid or Nowruz observances in Muslim villages.', options: [o('regular', 'Regular', 100), o('occasional', 'Occasional', 50), o('never', 'Never', 0)] },
      { id: 'H7', q: 'Are younger people losing interest in Ladakhi language, festivals and practices?', type: 'scale', dim: 'spi', indicator: 'Cultural continuity', options: AGREE_REVERSED(),
        help: 'Here agreeing is the worrying answer, so "Strongly agree" scores 0.' },
    ],
  },
  {
    id: 'I', title: 'Technology & Development Priorities', short: 'Priorities', icon: 'smartphone',
    note: 'Not part of the well-being score. Reported separately.',
    items: [
      { id: 'I1', q: 'Does the household have a smartphone?', type: 'single', options: [o('more_than_one', 'Yes, more than one'), o('one', 'Yes, one'), o('no', 'No')] },
      { id: 'I2', q: 'Internet access', type: 'single', options: [o('reliable', 'Reliable broadband / 4G'), o('intermittent', 'Intermittent mobile data'), o('none', 'None')] },
      { id: 'I3', q: 'Heard of or used an AI tool (chatbot, voice assistant)?', type: 'single', options: [o('use', 'Use one'), o('aware', "Aware, don't use"), o('never', 'Never heard of one')] },
      { id: 'I4', q: 'Would you use a phone assistant for…', type: 'multi', options: [o('health', 'Health information'), o('weather', 'Weather / road status'), o('schemes', 'Scheme information'), o('farming', 'Farming / livestock advice'), o('education', 'Education'), o('tourism', 'Tourism / business'), o('none', 'Not interested')] },
      { id: 'I5', q: "Your village's top 3 development priorities, most important first", type: 'rank3',
        options: [o('water', 'Water security'), o('health', 'Healthcare'), o('roads', 'Roads / winter connectivity'), o('education', 'Education'), o('jobs', 'Employment'), o('energy', 'Renewable energy / heating'), o('waste', 'Waste management'), o('tourism', 'Tourism management'), o('culture', 'Cultural preservation'), o('digital', 'Digital connectivity')] },
    ],
  },
];

/** Every question by id. */
export const ITEMS: Record<string, Item & { section: string }> = {};
for (const s of SECTIONS) for (const it of s.items) ITEMS[it.id] = { ...it, section: s.id };

/**
 * The number people see: section letter + position (C1, C2, C3…), always in order with no gaps.
 * The id (it.id) is what answers are stored under and never changes, so a removed question's id
 * is never reused and earlier surveys keep their meaning — the shown number can change freely.
 */
export const QUESTION_NO: Record<string, string> = {};
for (const s of SECTIONS) {
  let n = 0;
  // a follow-up shares the number of the question it follows: B2 → B2a
  for (const it of s.items) QUESTION_NO[it.id] = it.showIf && QUESTION_NO[it.showIf.item] ? `${QUESTION_NO[it.showIf.item]}a` : `${s.id}${++n}`;
}
export const questionNo = (id: string) => QUESTION_NO[id] ?? id;

/** Scored questions, in questionnaire order. */
export const SCORED_ITEMS = Object.values(ITEMS).filter(i => i.dim);

/** Scored questions per dimension. */
export const DIM_ITEMS = Object.fromEntries(
  DIMENSIONS.map(d => [d.id, SCORED_ITEMS.filter(i => i.dim === d.id)]),
) as Record<DimensionId, (Item & { section: string })[]>;

const filled = (v: unknown) => v !== undefined && v !== null && v !== '';

/**
 * Should a conditional question be shown, given the answers so far? Also shown when the
 * question it depends on was never asked but it has an answer — a survey from an earlier
 * questionnaire (e.g. height and weight before v3.1 asked B1s).
 */
export const isShown = (item: Item, answers: Record<string, unknown>) =>
  !item.showIf || item.showIf.in.includes(String(answers[item.showIf.item] ?? ''))
  || (!filled(answers[item.showIf.item]) && filled(answers[item.id]));
