/**
 * Household codes: DISTRICT LETTER _ VILLAGE CODE _ NUMBER
 *
 *   L_CHL_001   Leh district, Choglamsar, household 1
 *   K_KRG_014   Kargil district, Kargil village, household 14
 *   Z_PDM_102   Zanskar district, Padum, household 102
 *
 * District letters: L Leh · S Sham · N Nubra · C Changthang · K Kargil · Z Zanskar · D Drass.
 * Village codes are fixed in districts.ts and unique inside each district, so a code never
 * repeats. Numbers count up per village and are assigned by the server when a survey is
 * uploaded (a phone working offline cannot know the next free number).
 */

import { DISTRICT_BY_ID, type DistrictId } from './districts';

export const householdCode = (district: string, villageCode: string, seq: number) =>
  `${DISTRICT_BY_ID[district as DistrictId]?.letter ?? '?'}_${villageCode}_${String(seq).padStart(3, '0')}`;

export const HOUSEHOLD_CODE_PATTERN = /^[LSNCKZD]_[A-Z]{3}_\d{3,}$/;
