import { useEffect, useState } from 'react';
import { Field, LoadingState, Notice, PageHeader, Panel } from '../../components/common/ProcurementUI.jsx';
import { profileService } from '../../services/procurementService.js';
import { explainError } from '../../services/api.js';

export default function ProfileManagement() {
  const [profile, setProfile] = useState({
    businessName: '',
    registrationNo: '',
    category: '',
    location: '',
    description: '',
    contactPerson: '',
    contactEmail: '',
    contactPhone: '',
    publicContactEmail: '',
    annualTurnover: '',
    yearsOfExperience: '',
    productsServices: '',
    certifications: '',
    shareInDirectory: false,
    previousProjects: [],
  });

  const [completionScore, setCompletionScore] = useState(0);
  const [missingSections, setMissingSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Helper for adding/removing past projects
  const [newProject, setNewProject] = useState({
    title: '',
    client: '',
    year: '',
    value: '',
    description: '',
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await profileService.get();
        if (response?.item) {
          const item = response.item;
          setProfile({
            businessName: item.businessName || '',
            registrationNo: item.registrationNo || '',
            category: item.category || '',
            location: item.location || '',
            description: item.description || '',
            contactPerson: item.contactPerson || '',
            contactEmail: item.contactEmail || '',
            contactPhone: item.contactPhone || '',
            publicContactEmail: item.publicContactEmail || '',
            annualTurnover: item.annualTurnover !== null && item.annualTurnover !== undefined ? String(item.annualTurnover) : '',
            yearsOfExperience: item.yearsOfExperience !== null && item.yearsOfExperience !== undefined ? String(item.yearsOfExperience) : '',
            productsServices: Array.isArray(item.productsServices) ? item.productsServices.join(', ') : (item.productsServices || ''),
            certifications: Array.isArray(item.certifications) ? item.certifications.join(', ') : '',
            shareInDirectory: Boolean(item.shareInDirectory),
            previousProjects: Array.isArray(item.previousProjects) ? item.previousProjects : [],
          });

          if (typeof response.profileCompletion === 'number') {
            setCompletionScore(response.profileCompletion);
          }
          if (Array.isArray(response.missingFields)) {
            setMissingSections(response.missingFields);
          }
        }
      } catch (err) {
        if (err?.status !== 404) {
          setError(explainError(err));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleChange(field, value) {
    setProfile(prev => ({ ...prev, [field]: value }));
  }

  function handleAddProject(e) {
    e.preventDefault();
    if (!newProject.title.trim()) return;
    setProfile(prev => ({
      ...prev,
      previousProjects: [...prev.previousProjects, { ...newProject, id: Date.now().toString() }],
    }));
    setNewProject({ title: '', client: '', year: '', value: '', description: '' });
  }

  function handleRemoveProject(index) {
    setProfile(prev => ({
      ...prev,
      previousProjects: prev.previousProjects.filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const payload = {
      businessName: profile.businessName.trim(),
      registrationNo: profile.registrationNo.trim() || null,
      category: profile.category.trim(),
      location: profile.location.trim(),
      description: profile.description.trim() || null,
      contactPerson: profile.contactPerson.trim() || null,
      contactEmail: profile.contactEmail.trim() || null,
      contactPhone: profile.contactPhone.trim() || null,
      publicContactEmail: profile.publicContactEmail.trim() || null,
      annualTurnover: profile.annualTurnover === '' ? null : Number(profile.annualTurnover),
      yearsOfExperience: profile.yearsOfExperience === '' ? null : Number(profile.yearsOfExperience),
      productsServices: profile.productsServices
        ? profile.productsServices.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      certifications: profile.certifications
        ? profile.certifications.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      shareInDirectory: profile.shareInDirectory,
      previousProjects: profile.previousProjects,
    };

    try {
      const response = await profileService.save(payload);
      setSuccessMessage('Business profile saved successfully.');
      if (typeof response?.profileCompletion === 'number') {
        setCompletionScore(response.profileCompletion);
      }
      if (Array.isArray(response?.missingFields)) {
        setMissingSections(response.missingFields);
      }
    } catch (err) {
      setError(explainError(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading business profile..." />;
  }

  return (
    <>
      <PageHeader
        eyebrow="BUSINESS SETTINGS"
        title="Business Profile & Qualifications"
        description="Maintain your enterprise details, contact channels, capacity metrics, and project track record to power accurate tender eligibility evaluation."
      />

      {error && <Notice kind="error">{error}</Notice>}
      {successMessage && <Notice kind="success">{successMessage}</Notice>}

      {/* Profile Strength & Completion Progress Meter */}
      <section className="panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Profile Strength & Readiness</h3>
            <p style={{ margin: '4px 0 0', color: '#66788d', fontSize: 13 }}>
              High-readiness profiles achieve instant advisory qualification when exploring private procurements.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: completionScore >= 80 ? '#21754e' : '#b25e00' }}>
              {completionScore}%
            </span>
          </div>
        </div>

        <div style={{ width: '100%', height: 10, background: '#e5eaf0', borderRadius: 5, overflow: 'hidden', marginBottom: 12 }}>
          <div
            style={{
              width: `${Math.min(100, Math.max(0, completionScore))}%`,
              height: '100%',
              background: completionScore >= 80 ? '#28a745' : completionScore >= 50 ? '#ffc107' : '#fd7e14',
              transition: 'width 0.4s ease',
            }}
          />
        </div>

        {missingSections.length > 0 && (
          <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}>
            <strong style={{ color: '#475569' }}>Recommended next steps: </strong>
            <span style={{ color: '#64748b' }}>
              Add details for {missingSections.slice(0, 4).join(', ')} to boost your score.
            </span>
          </div>
        )}
      </section>

      <form onSubmit={handleSubmit}>
        {/* Section 1: Business Identity & Overview */}
        <Panel
          title="1. Enterprise Identity"
          description="Legal registration and core operational classification."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <Field label="Business name" required>
              <input
                type="text"
                value={profile.businessName}
                onChange={e => handleChange('businessName', e.target.value)}
                placeholder="e.g. Apex Civil & Engineering Ltd"
                required
              />
            </Field>

            <Field label="Registration / Tax ID (CIN / GST / PAN / Reg No)">
              <input
                type="text"
                value={profile.registrationNo}
                onChange={e => handleChange('registrationNo', e.target.value)}
                placeholder="e.g. U74999MH2018PTC123456"
              />
            </Field>

            <Field label="Primary industry / category" required>
              <input
                type="text"
                value={profile.category}
                onChange={e => handleChange('category', e.target.value)}
                placeholder="e.g. Construction & Infrastructure"
                required
              />
            </Field>

            <Field label="Headquarters / Operating Location" required>
              <input
                type="text"
                value={profile.location}
                onChange={e => handleChange('location', e.target.value)}
                placeholder="e.g. Mumbai, Maharashtra"
                required
              />
            </Field>
          </div>

          <div style={{ marginTop: 14 }}>
            <Field label="Executive summary / Description">
              <textarea
                rows={3}
                value={profile.description}
                onChange={e => handleChange('description', e.target.value)}
                placeholder="Briefly describe your company's core specialization, service footprint, and key infrastructure capabilities..."
              />
            </Field>
          </div>
        </Panel>

        {/* Section 2: Contact Channels */}
        <Panel
          title="2. Direct Contact Channels"
          description="Details used by procuring organizations when issuing formal clarifications or invitations."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <Field label="Primary Contact Person">
              <input
                type="text"
                value={profile.contactPerson}
                onChange={e => handleChange('contactPerson', e.target.value)}
                placeholder="e.g. Rajesh Sharma"
              />
            </Field>

            <Field label="Official Contact Email">
              <input
                type="email"
                value={profile.contactEmail}
                onChange={e => handleChange('contactEmail', e.target.value)}
                placeholder="e.g. bids@apexcivil.com"
              />
            </Field>

            <Field label="Contact Phone Number">
              <input
                type="tel"
                value={profile.contactPhone}
                onChange={e => handleChange('contactPhone', e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
            </Field>

            <Field label="Public Directory Inquiries Email">
              <input
                type="email"
                value={profile.publicContactEmail}
                onChange={e => handleChange('publicContactEmail', e.target.value)}
                placeholder="e.g. partners@apexcivil.com"
              />
            </Field>
          </div>
        </Panel>

        {/* Section 3: Financial & Technical Capacity */}
        <Panel
          title="3. Financial & Technical Eligibility Capacity"
          description="These metrics are evaluated against tender criteria for instant qualification."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <Field label="Annual Turnover (₹ in Lakhs)">
              <input
                type="number"
                min="0"
                step="any"
                value={profile.annualTurnover}
                onChange={e => handleChange('annualTurnover', e.target.value)}
                placeholder="e.g. 250 (for ₹2.5 Crore)"
              />
            </Field>

            <Field label="Years of Active Experience">
              <input
                type="number"
                min="0"
                max="100"
                value={profile.yearsOfExperience}
                onChange={e => handleChange('yearsOfExperience', e.target.value)}
                placeholder="e.g. 7"
              />
            </Field>
          </div>

          <div style={{ marginTop: 14 }}>
            <Field label="Products & Services Offered (comma-separated)">
              <input
                type="text"
                value={profile.productsServices}
                onChange={e => handleChange('productsServices', e.target.value)}
                placeholder="e.g. Road Construction, Earthworks, Structural Concrete, Paving, Drainage Systems"
              />
            </Field>
          </div>

          <div style={{ marginTop: 14 }}>
            <Field label="Accreditations & Certifications (comma-separated)">
              <input
                type="text"
                value={profile.certifications}
                onChange={e => handleChange('certifications', e.target.value)}
                placeholder="e.g. ISO 9001:2015, ISO 14001, MSME Registered, CPWD Class 1"
              />
            </Field>
          </div>
        </Panel>

        {/* Section 4: Past Projects & Track Record */}
        <Panel
          title="4. Past Projects & Track Record"
          description="Demonstrate prior project execution experience to fulfill specific past performance criteria."
        >
          {profile.previousProjects.length > 0 ? (
            <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
              {profile.previousProjects.map((proj, idx) => (
                <div
                  key={proj.id || idx}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '12px 16px',
                    background: '#f8fafc',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, color: '#1e293b' }}>
                      {proj.title} {proj.year && <span style={{ color: '#64748b', fontWeight: 400 }}>({proj.year})</span>}
                    </h4>
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                      {proj.client && <span><strong>Client:</strong> {proj.client} &nbsp;•&nbsp; </span>}
                      {proj.value && <span><strong>Value:</strong> ₹{proj.value} &nbsp;•&nbsp; </span>}
                    </div>
                    {proj.description && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                        {proj.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ fontSize: 12, padding: '4px 8px', color: '#c53030' }}
                    onClick={() => handleRemoveProject(idx)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 8, textAlign: 'center', color: '#64748b', fontSize: 13, marginBottom: 18 }}>
              No past projects added yet. Adding 2–3 recent engagements strengthens advisory evaluations.
            </div>
          )}

          {/* Add Project Sub-form */}
          <div style={{ background: '#f1f5f9', padding: 14, borderRadius: 8 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#334155' }}>Add a Completed Project</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <input
                type="text"
                placeholder="Project Title *"
                value={newProject.title}
                onChange={e => setNewProject(p => ({ ...p, title: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Client Name"
                value={newProject.client}
                onChange={e => setNewProject(p => ({ ...p, client: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Completion Year (e.g. 2024)"
                value={newProject.year}
                onChange={e => setNewProject(p => ({ ...p, year: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Contract Value (e.g. 1.2 Cr)"
                value={newProject.value}
                onChange={e => setNewProject(p => ({ ...p, value: e.target.value }))}
              />
            </div>
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                placeholder="Scope / brief summary of delivered work"
                value={newProject.description}
                onChange={e => setNewProject(p => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={handleAddProject}
                disabled={!newProject.title.trim()}
              >
                + Add Project to Track Record
              </button>
            </div>
          </div>
        </Panel>

        {/* Section 5: Joint Venture & Directory Preferences */}
        <Panel
          title="5. Collaboration & Subcontracting Visibility"
          description="Control how your business is discovered by peer contractors forming joint venture consortiums."
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={profile.shareInDirectory}
              onChange={e => handleChange('shareInDirectory', e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span>
              <strong>Publish profile in the JV Partner Directory</strong>
              <br />
              <small style={{ color: '#66788d' }}>
                Allows other verified enterprises to contact you for joint bids, subcontracts, or capacity pooling.
              </small>
            </span>
          </label>
        </Panel>

        <div className="form-submit-bar" style={{ marginTop: 20 }}>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? 'Saving Profile...' : 'Save Profile Changes'}
          </button>
        </div>
      </form>
    </>
  );
}
