/**
 * TenderBridge Eligibility Engine
 * Module: Member 2 - Core Intelligence & Analysis Engine
 *
 * Deterministic, rule-based screening engine that evaluates whether a business
 * profile meets the eligibility criteria of a government or organization tender.
 *
 * Pure function: No database, HTTP, or external API dependencies.
 */

export const EligibilityStatus = Object.freeze({
  ELIGIBLE: 'Eligible',
  POTENTIALLY_ELIGIBLE: 'Potentially Eligible',
  NOT_ELIGIBLE: 'Not Eligible',
});

export const CriterionStatus = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  UNKNOWN: 'UNKNOWN',
});

const DEFAULT_DISCLAIMER =
  'This is a preliminary assessment based on the supplied information, not a guarantee of tender acceptance.';

/**
 * Normalizes a string by trimming whitespace and converting to lowercase.
 * Returns null if the value is not a valid non-empty string.
 *
 * @param {*} value
 * @returns {string|null}
 */
function normalizeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

/**
 * Validates input structures and rejects invalid data types.
 *
 * @param {object} businessProfile
 * @param {object} eligibilityCriteria
 */
function validateInputs(businessProfile, eligibilityCriteria) {
  if (
    typeof businessProfile !== 'object' ||
    businessProfile === null ||
    Array.isArray(businessProfile)
  ) {
    throw new TypeError('businessProfile must be a non-null object.');
  }

  if (
    typeof eligibilityCriteria !== 'object' ||
    eligibilityCriteria === null ||
    Array.isArray(eligibilityCriteria)
  ) {
    throw new TypeError('eligibilityCriteria must be a non-null object.');
  }

  // Validate businessProfile.annualTurnover
  if (
    businessProfile.annualTurnover !== undefined &&
    businessProfile.annualTurnover !== null
  ) {
    if (
      typeof businessProfile.annualTurnover !== 'number' ||
      !Number.isFinite(businessProfile.annualTurnover)
    ) {
      throw new TypeError(
        'businessProfile.annualTurnover must be a finite number in lakhs.'
      );
    }
    if (businessProfile.annualTurnover < 0) {
      throw new RangeError(
        'businessProfile.annualTurnover cannot be negative.'
      );
    }
  }

  // Validate businessProfile.yearsOfExperience
  if (
    businessProfile.yearsOfExperience !== undefined &&
    businessProfile.yearsOfExperience !== null
  ) {
    if (
      typeof businessProfile.yearsOfExperience !== 'number' ||
      !Number.isFinite(businessProfile.yearsOfExperience)
    ) {
      throw new TypeError(
        'businessProfile.yearsOfExperience must be a finite number.'
      );
    }
    if (businessProfile.yearsOfExperience < 0) {
      throw new RangeError(
        'businessProfile.yearsOfExperience cannot be negative.'
      );
    }
  }

  // Validate businessProfile.certifications
  if (
    businessProfile.certifications !== undefined &&
    businessProfile.certifications !== null
  ) {
    if (!Array.isArray(businessProfile.certifications)) {
      throw new TypeError(
        'businessProfile.certifications must be an array of strings.'
      );
    }
  }

  // Validate eligibilityCriteria.minTurnover
  if (
    eligibilityCriteria.minTurnover !== undefined &&
    eligibilityCriteria.minTurnover !== null
  ) {
    if (
      typeof eligibilityCriteria.minTurnover !== 'number' ||
      !Number.isFinite(eligibilityCriteria.minTurnover)
    ) {
      throw new TypeError(
        'eligibilityCriteria.minTurnover must be a finite number in lakhs.'
      );
    }
    if (eligibilityCriteria.minTurnover < 0) {
      throw new RangeError(
        'eligibilityCriteria.minTurnover cannot be negative.'
      );
    }
  }

  // Validate eligibilityCriteria.minExperienceYears
  if (
    eligibilityCriteria.minExperienceYears !== undefined &&
    eligibilityCriteria.minExperienceYears !== null
  ) {
    if (
      typeof eligibilityCriteria.minExperienceYears !== 'number' ||
      !Number.isFinite(eligibilityCriteria.minExperienceYears)
    ) {
      throw new TypeError(
        'eligibilityCriteria.minExperienceYears must be a finite number.'
      );
    }
    if (eligibilityCriteria.minExperienceYears < 0) {
      throw new RangeError(
        'eligibilityCriteria.minExperienceYears cannot be negative.'
      );
    }
  }

  // Validate eligibilityCriteria.requiredCertifications
  if (
    eligibilityCriteria.requiredCertifications !== undefined &&
    eligibilityCriteria.requiredCertifications !== null
  ) {
    if (!Array.isArray(eligibilityCriteria.requiredCertifications)) {
      throw new TypeError(
        'eligibilityCriteria.requiredCertifications must be an array of strings.'
      );
    }
  }

  // Validate eligibilityCriteria.locationRestrictions
  if (
    eligibilityCriteria.locationRestrictions !== undefined &&
    eligibilityCriteria.locationRestrictions !== null
  ) {
    if (!Array.isArray(eligibilityCriteria.locationRestrictions)) {
      throw new TypeError(
        'eligibilityCriteria.locationRestrictions must be an array of strings.'
      );
    }
  }
}

/**
 * Rule A: Minimum Turnover Evaluation
 */
function evaluateTurnoverCriterion(businessProfile, eligibilityCriteria) {
  const req = eligibilityCriteria.minTurnover;
  if (req === undefined || req === null) {
    return null; // Not required by tender
  }

  const bizTurnover = businessProfile.annualTurnover;
  if (bizTurnover === undefined || bizTurnover === null) {
    return {
      name: 'Minimum Turnover',
      status: CriterionStatus.UNKNOWN,
      businessValue: null,
      requiredValue: req,
      explanation: `Annual turnover is not specified in the business profile. Tender requires a minimum turnover of ₹${req} lakhs.`,
      missingDetail: 'Annual turnover is missing from the business profile.',
    };
  }

  if (bizTurnover >= req) {
    return {
      name: 'Minimum Turnover',
      status: CriterionStatus.PASS,
      businessValue: bizTurnover,
      requiredValue: req,
      explanation: `Business turnover of ₹${bizTurnover} lakhs meets or exceeds the required ₹${req} lakhs.`,
    };
  }

  return {
    name: 'Minimum Turnover',
    status: CriterionStatus.FAIL,
    businessValue: bizTurnover,
    requiredValue: req,
    explanation: `Business turnover of ₹${bizTurnover} lakhs is below the required minimum of ₹${req} lakhs.`,
  };
}

/**
 * Rule B: Minimum Experience Evaluation
 */
function evaluateExperienceCriterion(businessProfile, eligibilityCriteria) {
  const req = eligibilityCriteria.minExperienceYears;
  if (req === undefined || req === null) {
    return null; // Not required by tender
  }

  const bizExp = businessProfile.yearsOfExperience;
  if (bizExp === undefined || bizExp === null) {
    return {
      name: 'Minimum Experience',
      status: CriterionStatus.UNKNOWN,
      businessValue: null,
      requiredValue: req,
      explanation: `Years of experience is not specified in the business profile. Tender requires at least ${req} years.`,
      missingDetail: 'Years of business experience is missing from the profile.',
    };
  }

  if (bizExp >= req) {
    return {
      name: 'Minimum Experience',
      status: CriterionStatus.PASS,
      businessValue: bizExp,
      requiredValue: req,
      explanation: `Business experience of ${bizExp} years meets or exceeds the required minimum of ${req} years.`,
    };
  }

  return {
    name: 'Minimum Experience',
    status: CriterionStatus.FAIL,
    businessValue: bizExp,
    requiredValue: req,
    explanation: `Business experience of ${bizExp} years is below the required minimum of ${req} years.`,
  };
}

/**
 * Rule C: Required Certifications Evaluation
 */
function evaluateCertificationsCriterion(businessProfile, eligibilityCriteria) {
  const reqCerts = eligibilityCriteria.requiredCertifications;
  if (reqCerts === undefined || reqCerts === null || reqCerts.length === 0) {
    return null; // Not required by tender
  }

  const bizCerts = businessProfile.certifications;
  if (bizCerts === undefined || bizCerts === null) {
    return {
      name: 'Required Certifications',
      status: CriterionStatus.UNKNOWN,
      businessValue: null,
      requiredValue: [...reqCerts],
      explanation: `Certification information is not provided in the business profile. Tender requires: ${reqCerts.join(', ')}.`,
      missingDetail: 'Business certification details are missing from the profile.',
    };
  }

  // Create a normalized set of business certifications for case-insensitive, trimmed comparison
  const normalizedBizCerts = new Set(
    bizCerts
      .map(normalizeString)
      .filter((cert) => cert !== null)
  );

  const missingCertifications = reqCerts.filter((cert) => {
    const normalizedReq = normalizeString(cert);
    return normalizedReq ? !normalizedBizCerts.has(normalizedReq) : false;
  });

  if (missingCertifications.length === 0) {
    return {
      name: 'Required Certifications',
      status: CriterionStatus.PASS,
      businessValue: [...bizCerts],
      requiredValue: [...reqCerts],
      explanation: `Business holds all required certifications: ${reqCerts.join(', ')}.`,
    };
  }

  return {
    name: 'Required Certifications',
    status: CriterionStatus.FAIL,
    businessValue: [...bizCerts],
    requiredValue: [...reqCerts],
    missingItems: missingCertifications,
    explanation: `Business is missing required certification(s): ${missingCertifications.join(', ')}.`,
  };
}

/**
 * Rule D: Location Restrictions Evaluation
 */
function evaluateLocationCriterion(businessProfile, eligibilityCriteria, options = {}) {
  const reqLocations = eligibilityCriteria.locationRestrictions;
  if (reqLocations === undefined || reqLocations === null || reqLocations.length === 0) {
    return null; // Not restricted by tender
  }

  const rawBizLocation = businessProfile.location;
  const normalizedBizLocation = normalizeString(rawBizLocation);

  if (!normalizedBizLocation) {
    return {
      name: 'Location Restrictions',
      status: CriterionStatus.UNKNOWN,
      businessValue: null,
      requiredValue: [...reqLocations],
      explanation: `Business location is not specified. Tender restricts bids to: ${reqLocations.join(', ')}.`,
      missingDetail: 'Business location is missing from the profile.',
    };
  }

  const normalizedReqLocations = reqLocations
    .map(normalizeString)
    .filter((loc) => loc !== null);

  // Check direct exact match (case-insensitive & trimmed)
  if (normalizedReqLocations.includes(normalizedBizLocation)) {
    return {
      name: 'Location Restrictions',
      status: CriterionStatus.PASS,
      businessValue: rawBizLocation,
      requiredValue: [...reqLocations],
      explanation: `Business location '${rawBizLocation}' matches tender location requirements.`,
    };
  }

  // Check optional reliable mapping if supplied (e.g. city -> state dictionary)
  const locationMapping = options.locationMapping;
  if (locationMapping && typeof locationMapping === 'object') {
    const mapped = normalizeString(locationMapping[normalizedBizLocation]);
    if (mapped && normalizedReqLocations.includes(mapped)) {
      return {
        name: 'Location Restrictions',
        status: CriterionStatus.PASS,
        businessValue: rawBizLocation,
        requiredValue: [...reqLocations],
        explanation: `Business location '${rawBizLocation}' maps to required region '${mapped}'.`,
      };
    }
  }

  // Without a reliable ontology/mapping, do not assume city proves state or rule out sub-regions
  return {
    name: 'Location Restrictions',
    status: CriterionStatus.UNKNOWN,
    businessValue: rawBizLocation,
    requiredValue: [...reqLocations],
    explanation: `Business location '${rawBizLocation}' cannot be definitively matched to restricted locations (${reqLocations.join(', ')}) without verified geographic mapping.`,
    missingDetail: `Geographic relationship between '${rawBizLocation}' and allowed locations (${reqLocations.join(', ')}) requires manual verification.`,
  };
}

/**
 * Evaluates whether a business profile meets the tender eligibility criteria.
 *
 * @param {object} businessProfile - The business profile details.
 * @param {object} eligibilityCriteria - The tender criteria.
 * @param {object} [options] - Optional configurations (e.g. reliable locationMapping).
 * @returns {object} Structured evaluation breakdown.
 */
export function evaluateEligibility(businessProfile, eligibilityCriteria, options = {}) {
  // Validate inputs strictly without mutation
  validateInputs(businessProfile, eligibilityCriteria);

  const evaluatedCriteria = [];
  const missingInformation = [];

  // Evaluate each criterion if supplied in eligibility criteria
  const turnoverResult = evaluateTurnoverCriterion(businessProfile, eligibilityCriteria);
  if (turnoverResult) {
    if (turnoverResult.missingDetail) {
      missingInformation.push(turnoverResult.missingDetail);
      delete turnoverResult.missingDetail;
    }
    evaluatedCriteria.push(turnoverResult);
  }

  const experienceResult = evaluateExperienceCriterion(businessProfile, eligibilityCriteria);
  if (experienceResult) {
    if (experienceResult.missingDetail) {
      missingInformation.push(experienceResult.missingDetail);
      delete experienceResult.missingDetail;
    }
    evaluatedCriteria.push(experienceResult);
  }

  const certificationsResult = evaluateCertificationsCriterion(businessProfile, eligibilityCriteria);
  if (certificationsResult) {
    if (certificationsResult.missingDetail) {
      missingInformation.push(certificationsResult.missingDetail);
      delete certificationsResult.missingDetail;
    }
    evaluatedCriteria.push(certificationsResult);
  }

  const locationResult = evaluateLocationCriterion(businessProfile, eligibilityCriteria, options);
  if (locationResult) {
    if (locationResult.missingDetail) {
      missingInformation.push(locationResult.missingDetail);
      delete locationResult.missingDetail;
    }
    evaluatedCriteria.push(locationResult);
  }

  // Partition criteria into result buckets
  const passedCriteria = evaluatedCriteria.filter((c) => c.status === CriterionStatus.PASS);
  const failedCriteria = evaluatedCriteria.filter((c) => c.status === CriterionStatus.FAIL);
  const unknownCriteria = evaluatedCriteria.filter((c) => c.status === CriterionStatus.UNKNOWN);

  let overallStatus;
  let summary;

  // Rule F: Overall status determination
  if (evaluatedCriteria.length === 0) {
    overallStatus = EligibilityStatus.POTENTIALLY_ELIGIBLE;
    summary = 'No tender eligibility criteria were supplied for evaluation. Assessment cannot be definitively completed.';
    missingInformation.push('No tender eligibility criteria were supplied for evaluation.');
  } else if (failedCriteria.length > 0) {
    overallStatus = EligibilityStatus.NOT_ELIGIBLE;
    const failedNames = failedCriteria.map((c) => c.name).join(', ');
    summary = `The business does not meet ${failedCriteria.length} mandatory requirement(s): ${failedNames}.`;
  } else if (unknownCriteria.length > 0) {
    overallStatus = EligibilityStatus.POTENTIALLY_ELIGIBLE;
    const unknownNames = unknownCriteria.map((c) => c.name).join(', ');
    summary = `Eligibility cannot be definitively confirmed due to uncertain or missing information for: ${unknownNames}.`;
  } else {
    overallStatus = EligibilityStatus.ELIGIBLE;
    summary = 'All evaluated mandatory criteria meet the supplied requirements.';
  }

  return {
    status: overallStatus,
    summary,
    criteria: evaluatedCriteria,
    passedCriteria,
    failedCriteria,
    unknownCriteria,
    missingInformation,
    disclaimer: DEFAULT_DISCLAIMER,
  };
}
