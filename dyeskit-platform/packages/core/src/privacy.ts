/**
 * The privacy policy — shown in the app and published at /privacy for the app stores.
 *
 * BEFORE PUBLISHING, fill in ORGANISATION below (the parts in [square brackets]): the legal name
 * of the organisation responsible for the data, a contact email that is read, and a grievance
 * officer, as India's Digital Personal Data Protection Act 2023 requires. Update `hosting` if the
 * server moves, and `updated` whenever the text changes.
 */

export const ORGANISATION = {
  name: 'Project DYESKIT',
  legalName: '[Legal name of the organisation running Project DYESKIT]',
  address: '[Postal address, Leh / Kargil, Ladakh]',
  contactEmail: '[contact email]',
  grievanceOfficer: '[Name of the grievance officer], [email], [phone]',
  hosting: 'Render (data centre in Singapore)',
};

export const PRIVACY_UPDATED = '9 October 2026';

export interface PolicySection { title: string; body: string[] }

export const PRIVACY_POLICY: PolicySection[] = [
  {
    title: 'Who we are',
    body: [
      `${ORGANISATION.name} studies the well-being of households in the villages of Ladakh, so that support — water, health, livelihoods, education and more — can go where it is needed most.`,
      `${ORGANISATION.legalName}, ${ORGANISATION.address}, is responsible for the personal data described here (the "Data Fiduciary" under India's Digital Personal Data Protection Act, 2023).`,
    ],
  },
  {
    title: 'What we collect',
    body: [
      'Account details: your name, and the phone number and/or email address you register with. Passwords are stored only in scrambled (hashed) form.',
      'Survey answers about a household: the village, household size and make-up, age and gender of the person answering, and questions about health, income, community, environment, education and beliefs. Some questions are personal; every one can be skipped.',
      'Optionally, the name and phone number of the head of the household.',
      'Basic records of use: when you sign in, and changes made to surveys (so that corrections can be checked).',
      'We do not collect your location, contacts, photos or any other data from your phone.',
    ],
  },
  {
    title: 'Why we collect it',
    body: [
      'To understand well-being in each village and district and report it — always as totals across many households, never naming a household.',
      'To let you sign in, fill in or correct your survey, and see your own result.',
      'To check the quality of the data (for example, to find mistyped answers).',
      'We use your data only with your consent, which you give when you register and before a survey starts. You can withdraw it at any time by deleting your survey or your account.',
    ],
  },
  {
    title: 'Who can see it',
    body: [
      'Household members see only their own survey and Ladakh-wide totals.',
      'Field researchers see the surveys of the villages assigned to them. Supervisors and project admins see all surveys, to check and correct them.',
      'Analysts and council viewers see dashboards and anonymised data, without household names, codes or phone numbers.',
      'Reports shared with government, councils or partners contain totals only, never individual answers.',
      'We never sell personal data or use it for advertising.',
    ],
  },
  {
    title: 'Where it is kept and for how long',
    body: [
      `Data is stored on our server and database, hosted by ${ORGANISATION.hosting}, and sent only over encrypted connections. Your sign-in is kept in your phone's secure storage.`,
      'Surveys not yet sent are kept on your phone until they upload.',
      'Survey answers are kept for as long as the study needs them to compare well-being over the years, after which they are deleted or fully anonymised. Account details are deleted when you delete your account.',
      'Sign-in codes are sent by text message through our SMS provider, which receives only your phone number and the code.',
    ],
  },
  {
    title: 'Your rights',
    body: [
      'See your data: household members can see their own survey and score in the app at any time.',
      'Correct it: you can edit your survey in the app, or ask us to correct anything.',
      'Delete it: you can delete your survey (More → My survey) or your whole account (More → Account & privacy) in the app. Deleting your account removes your name, phone and email.',
      'Complain: contact our grievance officer below. If you are not satisfied, you may complain to the Data Protection Board of India.',
    ],
  },
  {
    title: 'Children',
    body: ['Surveys are answered by adults (18 or older). We do not knowingly collect data from children.'],
  },
  {
    title: 'Contact',
    body: [
      `Questions or requests: ${ORGANISATION.contactEmail}.`,
      `Grievance officer: ${ORGANISATION.grievanceOfficer}.`,
      'If this policy changes, the new version will be shown in the app and on this page, with its date.',
    ],
  },
];
