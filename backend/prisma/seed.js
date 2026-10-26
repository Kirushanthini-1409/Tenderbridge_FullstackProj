import { PrismaClient } from '@prisma/client';

// Fictional sample records for demonstrations. Authorities and contact details
// are invented; .example addresses are reserved and cannot reach real people.
const prisma = new PrismaClient();
const tenders = [
  {
    referenceNumber: 'TB-DEMO-2026-001', title: 'Supply and installation of energy-efficient LED streetlights',
    description: 'Sample record. Supply, installation, testing, and commissioning of LED streetlights and associated controls.',
    category: 'Electrical Equipment', issuingAuthority: 'Sample City Municipal Corporation', status: 'ACTIVE',
    submissionDeadline: new Date('2026-12-01T18:30:00.000Z'), estimatedValue: 4800000,
    eligibilityCriteria: { minTurnover: 35, minExperienceYears: 3, requiredCertifications: ['Electrical contractor licence'], locationRestrictions: [] },
    requiredDocuments: ['Business registration', 'Electrical contractor licence', 'Audited turnover statement'],
  },
  {
    referenceNumber: 'TB-DEMO-2026-002', title: 'Supply of diagnostic laboratory equipment to regional clinics',
    description: 'Sample record. Supply, delivery, installation, and warranty support for diagnostic laboratory equipment.',
    category: 'Medical Supplies', issuingAuthority: 'Sample Public Health Department', status: 'ACTIVE',
    submissionDeadline: new Date('2026-12-11T18:30:00.000Z'), estimatedValue: 12500000,
    eligibilityCriteria: { minTurnover: 80, minExperienceYears: 4, requiredCertifications: ['Medical device quality certification'], locationRestrictions: [] },
    requiredDocuments: ['Business registration', 'Product catalogue', 'Quality certification', 'Audited turnover statement'],
  },
  {
    referenceNumber: 'TB-DEMO-2026-003', title: 'Road resurfacing and stormwater drainage improvements',
    description: 'Sample record. Road resurfacing and drainage repairs across designated municipal routes.',
    category: 'Construction', issuingAuthority: 'Sample Public Works Division', status: 'ACTIVE',
    submissionDeadline: new Date('2026-12-21T18:30:00.000Z'), estimatedValue: 22500000,
    eligibilityCriteria: { minTurnover: 150, minExperienceYears: 5, requiredCertifications: ['Civil works contractor registration'], locationRestrictions: ['Tamil Nadu'] },
    requiredDocuments: ['Business registration', 'Similar works certificates', 'Audited turnover statement', 'Civil works contractor registration'],
  },
  {
    referenceNumber: 'TB-DEMO-2026-004', title: 'Supply of computers and network equipment for public libraries',
    description: 'Sample record. Supply, configuration, and warranty support for desktop computers and network equipment.',
    category: 'IT & Computers', issuingAuthority: 'Sample Department of Digital Services', status: 'ACTIVE',
    submissionDeadline: new Date('2027-01-15T18:30:00.000Z'), estimatedValue: 9200000,
    eligibilityCriteria: { minTurnover: 50, minExperienceYears: 3, requiredCertifications: ['ISO 9001'], locationRestrictions: [] },
    requiredDocuments: ['Business registration', 'Product specifications', 'Warranty undertaking'],
  },
  {
    referenceNumber: 'TB-DEMO-2026-005', title: 'Supply of institutional uniforms and textile products',
    description: 'Sample record. Manufacture and supply of uniforms, protective clothing, and textile products.',
    category: 'Textiles', issuingAuthority: 'Sample State Education Board', status: 'ACTIVE',
    submissionDeadline: new Date('2027-01-22T18:30:00.000Z'), estimatedValue: 3600000,
    eligibilityCriteria: { minTurnover: 25, minExperienceYears: 2, requiredCertifications: [], locationRestrictions: [] },
    requiredDocuments: ['Business registration', 'Product samples', 'Quality certificates'],
  },
  {
    referenceNumber: 'TB-DEMO-2026-006', title: 'Supply and installation of classroom and office furniture',
    description: 'Sample record. Supply, assembly, and delivery of desks, chairs, storage, and office furniture.',
    category: 'Furniture', issuingAuthority: 'Sample Regional Administration', status: 'ACTIVE',
    submissionDeadline: new Date('2027-02-05T18:30:00.000Z'), estimatedValue: 5100000,
    eligibilityCriteria: { minTurnover: 30, minExperienceYears: 2, requiredCertifications: [], locationRestrictions: [] },
    requiredDocuments: ['Business registration', 'Product catalogue', 'Delivery plan'],
  },
  {
    referenceNumber: 'TB-DEMO-2026-007', title: 'Fleet vehicle rental and scheduled transport services',
    description: 'Sample record. Vehicle rental, maintenance, and scheduled transport services for regional offices.',
    category: 'Transportation', issuingAuthority: 'Sample Regional Health Service', status: 'ACTIVE',
    submissionDeadline: new Date('2027-02-19T18:30:00.000Z'), estimatedValue: 7800000,
    eligibilityCriteria: { minTurnover: 40, minExperienceYears: 3, requiredCertifications: ['Commercial vehicle permits'], locationRestrictions: [] },
    requiredDocuments: ['Business registration', 'Vehicle fleet list', 'Insurance certificates', 'Commercial permits'],
  },
  {
    referenceNumber: 'TB-DEMO-2026-008', title: 'Supply of office stationery and printing materials',
    description: 'Sample record. Supply and scheduled delivery of stationery and printing consumables.',
    category: 'Office Supplies', issuingAuthority: 'Sample Municipal Secretariat', status: 'ACTIVE',
    submissionDeadline: new Date('2027-03-05T18:30:00.000Z'), estimatedValue: 1450000,
    eligibilityCriteria: { minTurnover: 10, minExperienceYears: 1, requiredCertifications: [], locationRestrictions: [] },
    requiredDocuments: ['Business registration', 'Product price list', 'Delivery schedule'],
  },
];

const partners = [
  { key: 'it', businessName: '[SAMPLE] Meridian Systems Cooperative', category: 'IT & Computers', location: 'Chennai, Tamil Nadu', annualTurnover: 18500000, yearsOfExperience: 9, certifications: ['ISO 9001', 'ISO 27001', 'CMMI Level 3'], publicContactEmail: 'partnerships@meridian-systems.example' },
  { key: 'textile', businessName: '[SAMPLE] LoomWorks Manufacturing Collective', category: 'Textiles', location: 'Coimbatore, Tamil Nadu', annualTurnover: 9400000, yearsOfExperience: 12, certifications: ['ISO 9001', 'OEKO-TEX'], publicContactEmail: 'bids@loomworks.example' },
  { key: 'construction', businessName: '[SAMPLE] Northstar Civil Engineering Group', category: 'Construction', location: 'Bengaluru, Karnataka', annualTurnover: 42000000, yearsOfExperience: 16, certifications: ['ISO 9001', 'ISO 14001'], publicContactEmail: 'tenders@northstar-civil.example' },
  { key: 'medical', businessName: '[SAMPLE] Asterion Clinical Supply Network', category: 'Medical Supplies', location: 'Hyderabad, Telangana', annualTurnover: 27800000, yearsOfExperience: 8, certifications: ['ISO 13485', 'Good Distribution Practice'], publicContactEmail: 'procurement@asterion-clinical.example' },
  { key: 'electrical', businessName: '[SAMPLE] Vector Electrical Works Federation', category: 'Electrical Equipment', location: 'Pune, Maharashtra', annualTurnover: 21500000, yearsOfExperience: 11, certifications: ['ISO 9001', 'Electrical contractor licence'], publicContactEmail: 'bids@vector-electrical.example' },
];

try {
  for (const tender of tenders) {
    await prisma.tender.upsert({ where: { referenceNumber: tender.referenceNumber }, create: tender, update: tender });
  }
  for (const partner of partners) {
    const { key, ...data } = partner;
    await prisma.businessProfile.upsert({
      where: { ownerAuthId: `sample:jv:${key}` },
      create: { ...data, ownerAuthId: `sample:jv:${key}`, shareInDirectory: true },
      update: { ...data, shareInDirectory: true },
    });
  }
  console.info(`Upserted ${tenders.length} clearly identified fictional sample tenders and ${partners.length} sample partner profiles.`);
} finally {
  await prisma.$disconnect();
}
