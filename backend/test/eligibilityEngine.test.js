import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEligibility,
  EligibilityStatus,
  CriterionStatus,
} from '../src/services/eligibilityEngine.js';

test('1. All mandatory criteria pass -> Eligible', () => {
  const business = {
    businessName: 'ABC Enterprises',
    category: 'Computers',
    location: 'Tamil Nadu',
    annualTurnover: 50,
    yearsOfExperience: 5,
    certifications: ['MSME', 'ISO 9001'],
  };

  const tender = {
    minTurnover: 40,
    minExperienceYears: 3,
    requiredCertifications: ['MSME'],
    locationRestrictions: ['Tamil Nadu'],
  };

  const result = evaluateEligibility(business, tender);

  assert.equal(result.status, EligibilityStatus.ELIGIBLE);
  assert.equal(result.failedCriteria.length, 0);
  assert.equal(result.unknownCriteria.length, 0);
  assert.equal(result.passedCriteria.length, 4);
  assert.equal(result.missingInformation.length, 0);
  assert.match(result.summary, /All evaluated mandatory criteria meet/);
  assert.ok(result.disclaimer.includes('not a guarantee of tender acceptance'));
});

test('2. Turnover is below the mandatory minimum -> Not Eligible', () => {
  const business = {
    annualTurnover: 35,
    yearsOfExperience: 5,
    certifications: ['MSME'],
  };

  const tender = {
    minTurnover: 40,
    minExperienceYears: 3,
    requiredCertifications: ['MSME'],
  };

  const result = evaluateEligibility(business, tender);

  assert.equal(result.status, EligibilityStatus.NOT_ELIGIBLE);
  assert.equal(result.failedCriteria.length, 1);
  assert.equal(result.failedCriteria[0].name, 'Minimum Turnover');
  assert.equal(result.failedCriteria[0].status, CriterionStatus.FAIL);
  assert.equal(result.failedCriteria[0].businessValue, 35);
  assert.equal(result.failedCriteria[0].requiredValue, 40);
  assert.match(result.failedCriteria[0].explanation, /below the required minimum/);
});

test('3. Experience is below the mandatory minimum -> Not Eligible', () => {
  const business = {
    annualTurnover: 50,
    yearsOfExperience: 2,
  };

  const tender = {
    minTurnover: 40,
    minExperienceYears: 3,
  };

  const result = evaluateEligibility(business, tender);

  assert.equal(result.status, EligibilityStatus.NOT_ELIGIBLE);
  assert.equal(result.failedCriteria.length, 1);
  assert.equal(result.failedCriteria[0].name, 'Minimum Experience');
  assert.equal(result.failedCriteria[0].status, CriterionStatus.FAIL);
  assert.match(result.failedCriteria[0].explanation, /below the required minimum/);
});

test('4. A required certification is missing -> Not Eligible', () => {
  const business = {
    annualTurnover: 50,
    yearsOfExperience: 5,
    certifications: ['ISO 9001'],
  };

  const tender = {
    minTurnover: 40,
    minExperienceYears: 3,
    requiredCertifications: ['MSME', 'ISO 9001'],
  };

  const result = evaluateEligibility(business, tender);

  assert.equal(result.status, EligibilityStatus.NOT_ELIGIBLE);
  assert.equal(result.failedCriteria.length, 1);
  assert.equal(result.failedCriteria[0].name, 'Required Certifications');
  assert.deepEqual(result.failedCriteria[0].missingItems, ['MSME']);
  assert.match(result.failedCriteria[0].explanation, /missing required certification\(s\): MSME/);
});

test('5. Turnover information is missing -> Potentially Eligible if no other mandatory criterion fails', () => {
  const business = {
    annualTurnover: null,
    yearsOfExperience: 5,
    certifications: ['MSME'],
  };

  const tender = {
    minTurnover: 40,
    minExperienceYears: 3,
    requiredCertifications: ['MSME'],
  };

  const result = evaluateEligibility(business, tender);

  assert.equal(result.status, EligibilityStatus.POTENTIALLY_ELIGIBLE);
  assert.equal(result.failedCriteria.length, 0);
  assert.equal(result.unknownCriteria.length, 1);
  assert.equal(result.unknownCriteria[0].name, 'Minimum Turnover');
  assert.equal(result.unknownCriteria[0].status, CriterionStatus.UNKNOWN);
  assert.ok(result.missingInformation.some((m) => m.includes('Annual turnover')));
});

test('6. Certification information is unknown -> Potentially Eligible if no other mandatory criterion fails', () => {
  const business = {
    annualTurnover: 50,
    yearsOfExperience: 5,
    certifications: null, // absent/unknown
  };

  const tender = {
    minTurnover: 40,
    minExperienceYears: 3,
    requiredCertifications: ['MSME'],
  };

  const result = evaluateEligibility(business, tender);

  assert.equal(result.status, EligibilityStatus.POTENTIALLY_ELIGIBLE);
  assert.equal(result.failedCriteria.length, 0);
  assert.equal(result.unknownCriteria.length, 1);
  assert.equal(result.unknownCriteria[0].name, 'Required Certifications');
  assert.equal(result.unknownCriteria[0].status, CriterionStatus.UNKNOWN);
  assert.ok(result.missingInformation.some((m) => m.includes('certification details')));
});

test('7. Location cannot be determined -> Potentially Eligible if no other mandatory criterion fails', () => {
  // Business specifies city 'Chennai', tender specifies state 'Tamil Nadu'
  // Without verified geographic mapping, city cannot be assumed to prove state
  const business = {
    location: 'Chennai',
    annualTurnover: 50,
    yearsOfExperience: 5,
    certifications: ['MSME'],
  };

  const tender = {
    minTurnover: 40,
    minExperienceYears: 3,
    requiredCertifications: ['MSME'],
    locationRestrictions: ['Tamil Nadu'],
  };

  const result = evaluateEligibility(business, tender);

  assert.equal(result.status, EligibilityStatus.POTENTIALLY_ELIGIBLE);
  assert.equal(result.failedCriteria.length, 0);
  assert.equal(result.unknownCriteria.length, 1);
  assert.equal(result.unknownCriteria[0].name, 'Location Restrictions');
  assert.equal(result.unknownCriteria[0].status, CriterionStatus.UNKNOWN);
  assert.match(result.unknownCriteria[0].explanation, /cannot be definitively matched/);
  assert.ok(result.missingInformation.some((m) => m.includes('Geographic relationship')));
});

test('8. A known failure combined with missing information -> Not Eligible', () => {
  const business = {
    annualTurnover: 20, // FAILS (below 40)
    yearsOfExperience: null, // UNKNOWN
  };

  const tender = {
    minTurnover: 40,
    minExperienceYears: 3,
  };

  const result = evaluateEligibility(business, tender);

  assert.equal(result.status, EligibilityStatus.NOT_ELIGIBLE);
  assert.equal(result.failedCriteria.length, 1);
  assert.equal(result.unknownCriteria.length, 1);
  assert.equal(result.failedCriteria[0].name, 'Minimum Turnover');
  assert.equal(result.unknownCriteria[0].name, 'Minimum Experience');
});

test('9. Certification matching ignores case and surrounding whitespace', () => {
  const business = {
    certifications: ['  msme  ', 'iso 9001 '],
  };

  const tender = {
    requiredCertifications: ['MSME', 'ISO 9001'],
  };

  const result = evaluateEligibility(business, tender);

  assert.equal(result.status, EligibilityStatus.ELIGIBLE);
  assert.equal(result.passedCriteria.length, 1);
  assert.equal(result.passedCriteria[0].name, 'Required Certifications');
  assert.equal(result.passedCriteria[0].status, CriterionStatus.PASS);
});

test('10. No useful tender criteria supplied -> Potentially Eligible', () => {
  const business = {
    businessName: 'ABC Enterprises',
    annualTurnover: 50,
    yearsOfExperience: 5,
  };

  const tender = {}; // Empty criteria

  const result = evaluateEligibility(business, tender);

  assert.equal(result.status, EligibilityStatus.POTENTIALLY_ELIGIBLE);
  assert.equal(result.criteria.length, 0);
  assert.equal(result.passedCriteria.length, 0);
  assert.equal(result.failedCriteria.length, 0);
  assert.equal(result.unknownCriteria.length, 0);
  assert.match(result.summary, /No tender eligibility criteria were supplied/);
  assert.ok(result.missingInformation.includes('No tender eligibility criteria were supplied for evaluation.'));
});

test('11. Invalid negative numeric values -> clear validation error', () => {
  assert.throws(
    () => evaluateEligibility({ annualTurnover: -10 }, { minTurnover: 40 }),
    { name: 'RangeError', message: /businessProfile\.annualTurnover cannot be negative/ }
  );

  assert.throws(
    () => evaluateEligibility({ yearsOfExperience: -2 }, { minExperienceYears: 3 }),
    { name: 'RangeError', message: /businessProfile\.yearsOfExperience cannot be negative/ }
  );

  assert.throws(
    () => evaluateEligibility({ annualTurnover: 50 }, { minTurnover: -40 }),
    { name: 'RangeError', message: /eligibilityCriteria\.minTurnover cannot be negative/ }
  );

  assert.throws(
    () => evaluateEligibility({ yearsOfExperience: 5 }, { minExperienceYears: -3 }),
    { name: 'RangeError', message: /eligibilityCriteria\.minExperienceYears cannot be negative/ }
  );
});

test('12. The original input objects are not mutated', () => {
  const business = Object.freeze({
    businessName: 'Immutable Co',
    annualTurnover: 50,
    yearsOfExperience: 4,
    certifications: Object.freeze(['MSME']),
    location: 'Tamil Nadu',
  });

  const tender = Object.freeze({
    minTurnover: 30,
    minExperienceYears: 2,
    requiredCertifications: Object.freeze(['MSME']),
    locationRestrictions: Object.freeze(['Tamil Nadu']),
  });

  const businessCopy = JSON.parse(JSON.stringify(business));
  const tenderCopy = JSON.parse(JSON.stringify(tender));

  const result = evaluateEligibility(business, tender);

  assert.equal(result.status, EligibilityStatus.ELIGIBLE);
  assert.deepEqual(business, businessCopy);
  assert.deepEqual(tender, tenderCopy);
});

test('13. Non-numeric string inputs are rejected without silent coercion', () => {
  assert.throws(
    () => evaluateEligibility({ annualTurnover: '50' }, { minTurnover: 40 }),
    { name: 'TypeError', message: /must be a finite number/ }
  );

  assert.throws(
    () => evaluateEligibility({ yearsOfExperience: '5' }, { minExperienceYears: 3 }),
    { name: 'TypeError', message: /must be a finite number/ }
  );
});

test('14. Malformed non-object inputs are rejected with TypeError', () => {
  assert.throws(
    () => evaluateEligibility(null, {}),
    { name: 'TypeError', message: /businessProfile must be a non-null object/ }
  );

  assert.throws(
    () => evaluateEligibility([], {}),
    { name: 'TypeError', message: /businessProfile must be a non-null object/ }
  );

  assert.throws(
    () => evaluateEligibility({}, null),
    { name: 'TypeError', message: /eligibilityCriteria must be a non-null object/ }
  );
});

test('15. Reliable location mapping in options resolves city to state -> PASS', () => {
  const business = {
    location: 'Chennai',
  };

  const tender = {
    locationRestrictions: ['Tamil Nadu'],
  };

  const options = {
    locationMapping: {
      chennai: 'Tamil Nadu',
    },
  };

  const result = evaluateEligibility(business, tender, options);

  assert.equal(result.status, EligibilityStatus.ELIGIBLE);
  assert.equal(result.passedCriteria.length, 1);
  assert.equal(result.passedCriteria[0].name, 'Location Restrictions');
  assert.equal(result.passedCriteria[0].status, CriterionStatus.PASS);
});
