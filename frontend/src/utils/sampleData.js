const sampleTenders = [
  { referenceNumber: 'TB-DEMO-2026-001', title: 'Supply and installation of energy-efficient LED streetlights', category: 'Electrical Equipment', issuingAuthority: 'Sample City Municipal Corporation', submissionDeadline: '2026-12-01T18:30:00.000Z', estimatedValue: 4800000, status: 'ACTIVE', eligibilityCriteria: { minTurnover: 35, minExperienceYears: 3 } },
  { referenceNumber: 'TB-DEMO-2026-002', title: 'Supply of diagnostic laboratory equipment to regional clinics', category: 'Medical Supplies', issuingAuthority: 'Sample Public Health Department', submissionDeadline: '2026-12-11T18:30:00.000Z', estimatedValue: 12500000, status: 'ACTIVE', eligibilityCriteria: { minTurnover: 80, minExperienceYears: 4 } },
  { referenceNumber: 'TB-DEMO-2026-003', title: 'Road resurfacing and stormwater drainage improvements', category: 'Construction', issuingAuthority: 'Sample Public Works Division', submissionDeadline: '2026-12-21T18:30:00.000Z', estimatedValue: 22500000, status: 'ACTIVE', eligibilityCriteria: { minTurnover: 150, minExperienceYears: 5 } },
  { referenceNumber: 'TB-DEMO-2026-004', title: 'Supply of computers and network equipment for public libraries', category: 'IT & Computers', issuingAuthority: 'Sample Department of Digital Services', submissionDeadline: '2027-01-15T18:30:00.000Z', estimatedValue: 9200000, status: 'ACTIVE', eligibilityCriteria: { minTurnover: 50, minExperienceYears: 3 } },
];

const hiddenSampleSavedKey = 'tenderbridge:hidden-sample-saved:v1';
const readHiddenSaved = () => {
  try { return new Set(JSON.parse(localStorage.getItem(hiddenSampleSavedKey) || '[]')); }
  catch { return new Set(); }
};

export function sampleApplicationRecords() {
  const statuses = ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'REJECTED'];
  const submittedAt = ['2026-09-18T00:00:00.000Z', '2026-09-26T00:00:00.000Z', '2026-10-02T00:00:00.000Z', '2026-10-05T00:00:00.000Z'];
  return sampleTenders.map((tender, index) => ({
    id: `sample-application-${index + 1}`, isSample: true, tenderId: tender.referenceNumber,
    status: statuses[index], notes: 'Fictional sample record for demonstrating the application tracker; no real bid was submitted.',
    submissionDate: submittedAt[index], createdAt: submittedAt[index], updatedAt: submittedAt[index],
    tender,
  }));
}

export function sampleSavedRecords() {
  const hidden = readHiddenSaved();
  return sampleTenders.filter(tender => !hidden.has(tender.referenceNumber)).map((tender, index) => ({
    id: `sample-saved-${index + 1}`, isSample: true, tenderId: tender.referenceNumber, tender,
  }));
}

export function hideSampleSaved(referenceNumber) {
  const hidden = readHiddenSaved();
  hidden.add(referenceNumber);
  localStorage.setItem(hiddenSampleSavedKey, JSON.stringify([...hidden]));
}
